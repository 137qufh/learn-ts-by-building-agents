# 3.10 章末项目：流式 LLM 客户端

> 这一节要解决的问题：把本章的所有内容用上，写出 agent 的第三个核心部件：一个真正能用的流式大模型客户端。它要一个字一个字地交出回复，拼好分段到达的工具调用，在网络出问题时自动重试，卡住时超时，用户按 Ctrl+C 时立刻停下，而且无论怎样结束都不泄漏连接和定时器。

## 背景：客户端要处理的事情

调用一次模型，看起来只是"发一个 POST，读一个响应"。真正放进 agent 里长时间运行，要考虑的事情多得多：

| 情况                           | 应该怎么做                              | 用到的知识           |
| ------------------------------ | --------------------------------------- | -------------------- |
| 回复要几十秒才能生成完         | 流式读取，到一块交出一块                | 3.8、3.9             |
| 工具调用的参数分好几段到达     | 按 index 拼接，完整之后再交出           | 3.8                  |
| 4xx（参数错了、key 不对）      | 抛出带有服务器说明的 `ApiError`，不重试 | 3.4                  |
| 5xx、429、网络错误             | 退避后重试；有 `Retry-After` 就按它等   | 3.4、3.7             |
| 服务器迟迟不返回响应头         | 超时，然后重试                          | 3.6                  |
| 流开始之后出错                 | 交给调用者，**不重试**                  | 3.7、3.9             |
| 流卡住（连接还在，数据不来了） | 两块之间间隔太久就超时                  | 3.8 的 `idleTimeout` |
| 用户取消                       | 等待响应、等待重试、读取流，都立刻停下  | 3.6                  |
| 调用方提前 `break`             | 断开连接                                | 3.8                  |
| 任何一种结束方式               | 不留下定时器，不泄漏连接                | 3.6、3.8             |

你会发现，这张表里大部分的"零件"你已经在练习里做好了：`errorFromResponse`（练习 4）、`retry` 和 `parseRetryAfter`（练习 7）、`idleTimeout`（练习 8）、`readSse`（练习 9）。项目的主要工作是 **把它们正确地组装起来**，而组装恰恰是最容易出错的地方。

## 接口长什么样

题目在 [exercises/03-async/project/llm-client.ts](../../exercises/03-async/project/llm-client.ts)。用起来是这样的：

```ts
const client = createClient({
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: process.env.OPENAI_API_KEY ?? "",
  model: "deepseek-chat",
});

// 流式：边生成边显示
for await (const event of client.stream({ messages }, { signal })) {
  switch (event.type) {
    case "text":
      process.stdout.write(event.text);
      break;
    case "tool_call":
      console.log("模型想调用", event.call.name, event.call.arguments);
      break;
    case "finish":
      console.log("结束原因", event.reason, "用量", event.usage);
      break;
  }
}

// 不关心过程，只要结果
const result = await client.complete({ messages, tools: registry.schemas() });
```

几个设计决定：

- **只支持 OpenAI 兼容的 `/chat/completions` 接口。** 这是事实上的通用格式：OpenAI、DeepSeek、通义千问、Kimi、智谱、Ollama、vLLM、OpenRouter 都提供它，换一个 `baseUrl` 和 `model` 就能切换。各家的原生接口（比如 Anthropic 的 Messages API）这门课不逐家适配。[第 7 章](../07-extensions/README.md) 用 MCP 把外部工具接到同一个 harness 上，模型这一侧仍然走这个接口
- **`stream` 返回 `AsyncGenerator<StreamEvent>`**，`StreamEvent` 是一个可辨识联合（1.6 节），调用方用 `switch` 处理每种事件
- **工具的定义直接用第 2 章的 `ToolSchema`**，模型返回的工具调用就是第 2 章的 `RawToolCall`，可以直接交给 `registry.dispatch`；用量是第 1 章的 `Usage`。前面几章做的东西开始拼到一起了
- **`fetch` 可以替换。** 默认用全局的 `fetch`；测试时换成一个假的。这是 3.7 节"把依赖作为参数传进来"的又一次应用，也是这个项目能在没有网络、没有 API key 的情况下被完整测试的原因

## 假服务器

[project/fake-openai.ts](project/fake-openai.ts) 是一个假的 OpenAI 兼容接口。它是一个和 `fetch` 签名相同的函数，按事先写好的"剧本"返回响应：

```ts
const fake = createFakeOpenAI([
  errorReply(503, "过载了", { headers: { "Retry-After": "1" } }), // 第一个请求
  textReply("你好！", { delayMs: 30 }), // 第二个请求：一个字一个字地吐，每个间隔 30ms
]);
const client = createClient({ ...options, fetch: fake.fetch });

await client.complete(request);
fake.requests; // 收到的每个请求：url、请求头、请求体，以及连接是不是被客户端断开了
```

它返回的是真正的 `Response`，响应体是真正的 `ReadableStream`，也像真的 `fetch` 一样响应 `AbortSignal`。剧本可以模拟各种情况：错误状态码、很慢的响应头（`headersDelayMs`）、流中途断开（`{ fail: error }`）、流卡住（`hang: true`）。读一遍它的代码，它本身就是本章知识的一个练习。

测试里还有一个用例启动了一个真正的本机 HTTP 服务器，用全局的 `fetch` 连接它，确认客户端在真实的网络栈上也能工作。

## 四个部分

| 部分 | 内容                                      | 难度 |
| ---- | ----------------------------------------- | ---- |
| 一   | `buildRequest`：构造 URL、请求头和请求体  | ★    |
| 二   | `createToolCallAccumulator`：拼接工具调用 | ★★   |
| 三   | `parseStream`：SSE 事件 → `StreamEvent`   | ★★   |
| 四   | `createClient`：连接、超时、重试、取消    | ★★★  |

每个函数的具体要求写在题目的注释里。运行 `pnpm ex llm-client`，按顺序让每个 `describe` 变绿。

### 第一部分：构造请求

请求体是 OpenAI 的格式：`stream: true` 开启流式；`stream_options: { include_usage: true }` 让服务器在流的最后发送一个带 `usage` 的 chunk（不加的话，流式响应里没有用量信息）。我们的 `ChatRequest` 用的是 TS 风格的 `maxTokens`，发出去要改名为 `max_tokens`。可选的字段只在提供了的时候出现（`exactOptionalPropertyTypes` 下这也是更自然的写法）。

### 第二部分：拼接工具调用

模型决定调用工具时，参数是它 **一个 token 一个 token 生成** 的 JSON，所以也是分段到达的：

```text
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_weather","arguments":""}}]}}]}
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"ci"}}]}}]}
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ty\":\"北京\"}"}}]}}]}
```

`index` 区分不同的调用（模型可以一次调用多个工具），后续的片段只有 `index` 和一段 `arguments`。只有全部到齐之后，`arguments` 才是一段完整的 JSON。所以 `stream` 不交出半个工具调用，而是在流结束时交出完整的。

### 第三部分：解析流

把练习 9 的 `SseEvent` 变成 `StreamEvent`。注意两种"结束"：

- 正常结束：收到 `[DONE]`。之后就不要再读了，这样上游的清理会立刻执行
- 异常结束：流结束了，却既没有 `[DONE]` 也没有 `finish_reason`。这说明响应被截断了（比如服务器重启），必须报错，否则调用方会把半句话当成完整的回答

### 第四部分：组装

这是项目的核心。建议先写出最简单的版本（`fetch` → 检查状态码 → `parseStream(readSse(response))`），让"正常情况"的测试通过，然后一项项加上重试、超时、取消，每加一项跑一次测试。

## 提示

先自己尝试，卡住了再看。

### 超时只能覆盖"等待响应头"

练习 6 的 `withTimeout(task, ms)` 在这里 **不能** 直接用。它的定时器是 `AbortSignal.timeout(ms)`，task 完成之后还在计时。如果把它的 signal 交给 `fetch`：

```ts
const response = await withTimeout((signal) => fetch(url, { ...init, signal }), 60_000);
// fetch 在响应头到达时就完成了，但 60 秒的定时器还在走
// 一个回答写了 70 秒：读到第 60 秒时 signal 被取消，流被掐断
```

`fetch` 的 Promise 在 **响应头** 到达时就兑现了，而响应体还要读很久，它们用的是同一个 signal。所以超时要自己控制：用一个 `AbortController` 和 `setTimeout`，响应头一到就 `clearTimeout`。测试"timeoutMs 只限制等待响应头"专门检查这一点。读取阶段的超时交给 `idleTimeout`，它限制的是 **两块之间** 的间隔，不管总时长。

### 把 Retry-After 交给 retry

练习 7 的 `retry` 通过 `retryAfterMs(error)` 询问"服务器要求等多久"，但 `errorFromResponse` 返回的 `ApiError` 上没有响应头。参考答案的做法是在客户端内部用一个 `WeakMap<object, number>` 记下"这个错误对象对应的等待时间"。`WeakMap` 和 `Map` 的区别是：它的键必须是对象，而且它不会阻止键被垃圾回收，错误对象没人用了，记录也就自动消失。你也可以用别的办法，比如定义一个 `ApiError` 的子类，带上 `retryAfterMs` 属性。

### 断开连接

要求"无论怎样结束都断开连接"，最可靠的办法是 3.8 节的 `try/finally`：

```ts
async function* stream(request, { signal } = {}) {
  const connection = new AbortController(); // 自己控制的"总开关"
  const combined = signal ? AbortSignal.any([signal, connection.signal]) : connection.signal;
  try {
    // ……用 combined 发请求、读流……
  } finally {
    connection.abort(); // 正常结束、出错、被取消、被 break，都会走到这里
  }
}
```

为什么不能只依赖"退出 `for await` 会取消上游"？回想练习 8 的 `idleTimeout`：超时的时候，上游正卡在等待网络数据，它的 `return()` 要等下一块数据到达才会生效，而卡住的流可能永远不会有下一块。`abort()` 则直接让 `fetch` 断开连接，正在等待的读取立刻失败。测试"两块数据之间间隔太久"检查的就是这一点。

响应已经读完时再 `abort()` 没有任何影响，所以不需要判断"是不是正常结束"。

### 重试什么

- `retry` 只包住"发请求、等响应头、检查状态码"这一步。拿到 `Response` 之后的读取在 `retry` 外面，这样从结构上就保证了流开始之后不会重试
- `shouldRetry`：`isRetryable`（练习 4）覆盖了 `ApiError` 和网络错误。等待响应头超时的错误是 `TimeoutError`，也应该重试。用户的取消不用在这里判断，`retry` 自己会检查 `signal`（练习 7 的规则 1 和 3）
- 不是 2xx 的响应，用 `errorFromResponse` 读掉它的响应体。这既是为了拿到错误信息，也是为了释放连接：没有被读完的响应体会一直占着连接，直到被垃圾回收

### 其他

- `exactOptionalPropertyTypes`：不能把可能是 `undefined` 的 signal 直接写进 `{ signal }`。上面的写法根据有没有 signal 构造不同的值
- `stream` 里可以用 `yield* parseStream(...)` 把另一个生成器的事件原样交出去。`yield*` 也会转发 `return()`，消费者 `break` 时内层的生成器会被正确关闭
- `complete` 在收到 `finish` 事件时就可以 `return`。从 `for await` 中 `return` 会关闭 `stream`，于是 `finally` 执行

## 运行演示

```bash
pnpm tsx chapters/03-async/project/demo.ts
```

[演示](project/demo.ts) 默认使用假服务器：第一个请求返回 503，客户端等待 1 秒后重试，然后逐字打印回复；第二个请求带上一个工具，模型"请求调用"它。流式输出的过程中按 Ctrl+C 可以取消。

想连接真正的模型，在仓库根目录创建一个 `.env` 文件（它已经在 `.gitignore` 里，不会被提交）：

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=deepseek-chat
OPENAI_BASE_URL=https://api.deepseek.com/v1
```

然后运行：

```bash
pnpm tsx --env-file=.env chapters/03-async/project/demo.ts "用三句话介绍 TypeScript"
```

任何 OpenAI 兼容的接口都可以，在本机运行的 Ollama 也行（`OPENAI_BASE_URL=http://localhost:11434/v1`，`OPENAI_API_KEY` 随便填一个）。API key 只应该出现在 `.env` 或环境变量里，不要写进代码，也不要提交到仓库。

## 做完之后

对照 [参考答案](../../solutions/03-async/project/llm-client.ts)，然后想一想：

1. 参考答案里有几个 `AbortSignal`？分别是谁创建的、谁会取消它、谁在监听它？画一张图
2. 去掉 `finally` 里的 `connection.abort()`，运行测试，哪一个会失败？为什么消费者 `break`、解析出错这些情况下，连接仍然会被断开？
3. 现在每次请求最多等 `timeoutMs` 拿到响应头，最多重试 `retries` 次，那一次 `complete` 最长可能花多久？如果要限制"包括重试在内的总时长"，调用方可以怎么做？（提示：`AbortSignal.timeout`、`AbortSignal.any`）
4. 用户在模型输出了一半时按下 Ctrl+C。这一半的文本应该保留在聊天记录里吗？如果保留，下一轮请求要怎么构造？（第 6 章会遇到这个问题）
5. `parseChunk` 用 `as` 相信了服务器返回的格式。如果某个兼容接口的 `delta.content` 是一个数组，会发生什么？第 5 章会用 Zod 解决这个问题

## 和后面章节的关系

- **第 4 章** 把这个客户端整理成一个可以发布的包：模块划分、lint（比如抓出忘了 `await` 的 Promise）、构建
- **第 5 章** 用 Zod 校验 `parseChunk` 和工具参数，去掉这里的 `as`
- **第 6 章** 的 agent 主循环：`stream` → 显示文本 → 收集 `tool_call` → 用第 2 章的注册表 `dispatch` → 把结果作为 `tool` 消息追加进聊天记录 → 再次 `stream`，直到 `finish` 的原因不是 `tool_calls`

## 小结

- 一个可靠的流式客户端 = 解析（SSE、JSON、工具调用拼接） + 错误处理（`ApiError`、截断检测） + 重试（只在流开始前） + 超时（等待响应头、两块之间） + 取消（`AbortSignal` 一路传下去）
- 依赖（`fetch`、`sleep`）作为参数传入，于是所有这些情况都能在没有网络的环境下被确定地测试
- `fetch` 在响应头到达时就完成了，超时要分成"等待响应"和"读取响应"两段
- 用 `try/finally` 加一个自己控制的 `AbortController` 保证资源被释放，不要依赖"上游会自己结束"
- 小的、单独测试过的零件（练习 4 到 9）组装成一个大的功能，难点在于零件之间的边界
