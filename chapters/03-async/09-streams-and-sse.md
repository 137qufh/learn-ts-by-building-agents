# 3.9 流与 SSE：解析流式响应

> 这一节要解决的问题：`fetch` 一个开启了 `stream: true` 的模型接口，拿到的是什么？怎么把它变成一个个文本片段？中间有哪些容易出错的地方？

示例代码：[examples/09-streams-and-sse.ts](examples/09-streams-and-sse.ts)

## 响应体是一个字节流

前面用 `fetch` 时，我们都是 `await response.json()` 或 `await response.text()`：等整个响应体下载完，一次性解析。流式接口不能这么用。模型生成一段长回答可能要几十秒，用户希望第一个字一出来就看到。

`response.body` 的类型是 `ReadableStream<Uint8Array> | null`：一个 **字节流**（没有响应体时是 `null`，比如状态码 204）。`Uint8Array` 是一段字节，数据从网络上到达一块，流里就多一块。

读取它有两种方式。底层的方式是拿一个 reader：

```ts
const reader = body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // value: Uint8Array
}
```

更简单的方式：`ReadableStream` 是异步可迭代对象，可以直接 `for await`：

```ts
for await (const chunk of body) {
  // chunk: Uint8Array
}
```

而且，和上一节的生成器一样，**从 `for await` 中提前退出会取消这个流**。对 `fetch` 的响应体来说，就是断开和服务器的连接，服务器那边能感知到，停止生成。示例的最后一部分用一个本地服务器演示了真实的流式传输。

> 这里的 `ReadableStream` 是 Web 标准的流（浏览器、Deno、Bun 和 Node 都有）。Node 还有一套更早的流（`node:stream` 模块），API 不同，两者可以相互转换。`fetch` 用的是 Web 标准的流，本课程也只用这一种。

## 第一个坑：字节到文本

模型输出的是文本，网络传输的是字节。把字节变成文本用 `TextDecoder`。直觉上的写法是每块解码一次：

```ts
for await (const chunk of body) {
  text += new TextDecoder().decode(chunk); // ❌
}
```

问题在于：UTF-8 里一个汉字占 3 个字节（emoji 占 4 个），**网络并不关心字符的边界**，一个汉字的 3 个字节完全可能被拆到相邻的两块里。单独解码半个字符，得到的是替换字符 `�`（U+FFFD）：

```ts
const bytes = encoder.encode("你好"); // 6 个字节
const parts = [bytes.slice(0, 4), bytes.slice(4)]; // 在"好"的中间切开
parts.map((part) => new TextDecoder().decode(part)).join(""); // "你���"
```

这个 bug 在测试时很难发现：英文全是单字节字符，本地网络又快，块通常很大。上线后，中文用户偶尔会看到乱码。

正确的做法是 **用同一个解码器，并传 `{ stream: true }`**：

```ts
const decoder = new TextDecoder();
for (const part of parts) {
  text += decoder.decode(part, { stream: true }); // 不完整的字节先留在解码器里
}
text += decoder.decode(); // 流结束：处理剩下的字节
```

`stream: true` 告诉解码器"后面还有数据"，末尾不完整的字节先存着，和下一块拼起来再解码。

也可以让流自己完成这一步：`body.pipeThrough(new TextDecoderStream())` 把字节流变成文本流，内部做的就是同样的事情。`pipeThrough` 把一个流接到一个"变换流"上，得到一个新的流，和上一节的生成器管道是一个思路。

## 第二个坑：文本到行

流式接口的数据是按行组织的（下面马上会看到），而 **网络同样不关心行的边界**：

```ts
const textChunks = ["data: 你", "好\n\nda", "ta: 世界\n", "\n"];
textChunks.flatMap((chunk) => chunk.split("\n"));
// [ 'data: 你', '好', '', 'da', 'ta: 世界', '', '', '' ]  ❌
```

需要一个缓冲区：每块追加进去，切出完整的行，**最后一段可能不完整，留着和下一块拼起来**：

```ts
function* splitLines(chunks: Iterable<string>): Generator<string> {
  let buffer = "";
  for (const chunk of chunks) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // 最后一段可能不完整
    yield* lines;
  }
  if (buffer !== "") yield buffer;
}
```

`yield* 可迭代对象` 把另一个可迭代对象的值逐个 `yield` 出去。

这个版本只处理了 `\n`。完整的版本还要处理 `\r\n` 和单独的 `\r`，并且 `\r\n` 本身也可能被拆开：这是练习的一部分。

> 这两个坑本质上是同一个问题：**数据的边界（块）和含义的边界（字符、行、事件）不一致**。处理任何流式数据时都要问自己：如果在任意位置切开，我的代码还对吗？测试时也照这个思路：故意把输入在各种位置切开。

## SSE：服务器发送事件

几乎所有模型接口的流式输出都使用 **SSE**（Server-Sent Events，服务器发送事件）格式。它是 HTML 标准的一部分，格式很简单：响应的 `Content-Type` 是 `text/event-stream`，内容是一行行的文本：

```text
: 冒号开头的是注释，常用来保持连接
event: greeting
data: 第一行
data: 第二行

data: 没有 event 字段时，事件类型是 message

```

- 每行是 `字段名: 值` 的形式
- **空行表示一个事件结束**
- `data` 是事件的数据，一个事件可以有多个 `data` 行，用换行连接起来
- `event` 是事件类型，默认是 `message`
- `id` 是事件的编号，断线重连时用；`retry` 建议重连间隔。模型接口基本不用这两个

各家的用法略有不同。OpenAI 兼容的接口（OpenAI、DeepSeek、通义千问、Kimi、Ollama、vLLM 等）只用 `data`，每个事件的数据是一个 JSON，最后发一个特殊的 `data: [DONE]` 表示结束：

```text
data: {"choices":[{"index":0,"delta":{"role":"assistant","content":""}}]}

data: {"choices":[{"index":0,"delta":{"content":"你"}}]}

data: {"choices":[{"index":0,"delta":{"content":"好"}}]}

data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]

```

Anthropic 的接口则用 `event` 字段区分事件类型（`message_start`、`content_block_delta`、`message_stop` 等），`data` 里同样是 JSON。

每个 JSON 里的 `delta`（增量）是 **这一次新增的部分**，不是到目前为止的全文。客户端要自己把它们拼起来。章末项目会处理更复杂的情况：工具调用的参数也是一段段到达的。

### 为什么不用 EventSource

浏览器有一个现成的 SSE 客户端 `EventSource`，但它只能发 GET 请求，不能设置请求头，也不能带请求体。调用模型接口需要 POST 一个 JSON，还要在请求头里带 API key，所以各家 SDK 都是用 `fetch` 加自己写的 SSE 解析器，我们也一样。

## 完整的流程

把上面的步骤串起来，就是一条异步生成器的管道：

```text
response.body          ReadableStream<Uint8Array>
  → decodeChunks       AsyncGenerator<string>       字节 → 文本，处理被拆开的字符
  → splitLines         AsyncGenerator<string>       文本 → 行，处理被拆开的行
  → parseSse           AsyncGenerator<SseEvent>     行 → 事件
  → （章末项目）        AsyncGenerator<StreamEvent>  事件 → JSON → 文本片段、工具调用
```

每一层只关心一件事，可以单独测试。整条管道是拉取式的：消费者不读，就不会从网络上读取更多数据；消费者提前退出，取消会一路传到 `response.body`，断开连接。

## 流中途出错

流式响应有一个普通请求没有的问题：**状态码 200 之后，仍然可能出错**。

- 连接中途断开：`for await` 处抛出异常（通常是 `TypeError`，`cause` 里有具体原因）
- 服务器在流里发送一个错误事件：OpenAI 兼容的服务通常发一个包含 `error` 字段的 `data`，Anthropic 发一个 `event: error`
- 流卡住：连接还在，数据不来了。上一节练习的 `idleTimeout` 就是为此准备的

回想 3.7 节的结论：**流开始之后不要自动重试**。用户已经看到了一半的回答，重试会得到一个不同的回答。正确的做法是把错误报告给调用者，由上层决定。

## 小结

- `response.body` 是 `ReadableStream<Uint8Array> | null`，可以用 `for await` 逐块读取；提前退出会取消流、断开连接
- 字节 → 文本：用同一个 `TextDecoder`，传 `{ stream: true }`，最后再调用一次 `decode()`；或者用 `TextDecoderStream`
- 文本 → 行：用缓冲区，最后一段留到下一块
- 网络不关心字符、行、事件的边界。测试时要在任意位置切开输入
- SSE：`字段: 值` 的行，空行结束一个事件；OpenAI 兼容接口用 `data: JSON` 和 `data: [DONE]`
- 流开始后仍然可能出错，而且不应该自动重试

## 练习

[exercises/03-async/09-sse-parser.ts](../../exercises/03-async/09-sse-parser.ts)：实现 `decodeChunks`、`splitLines`、`parseSse`，以及把它们串起来的 `readSse`。测试会把输入切成各种奇怪的形状。运行 `pnpm ex 09-sse-parser`。

下一节：[3.10 章末项目：流式 LLM 客户端](10-project-streaming-client.md)
