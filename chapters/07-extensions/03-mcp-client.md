# 7.3 客户端，接到 harness

> 这一节要解决的问题：服务器会说话了。harness 认识的是 `ToolExecutor`，也就是 `schemas()` 和 `dispatch()`。中间差一层：列出来的 JSON Schema 怎么变成给模型的函数声明，模型返回的 JSON 字符串怎么变回 `callTool`。

示例代码：[examples/03-mcp-client.ts](examples/03-mcp-client.ts)

## 客户端拥有子进程

stdio 客户端不要自己先把服务器启动起来。`connect` 会 spawn，`close` 会把子进程关掉。先手动启动再连，会得到两个进程，或者连到一个谁也不读的 stdin 上。

```ts
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverFile],
  stderr: "pipe",
});
await client.connect(transport);
```

`stderr` 的默认值是 `"inherit"`：服务器 `console.error` 的字会出现在你这个进程的 stderr 上。课程的示例测试要求进程自己的 stderr 是空的，所以示例改成 `"pipe"`，自己把那一行读出来再打到 stdout。输出是：

```text
version 2025-11-25
timeout 60000
banner notes server ready
sum 3
agent 42
auto 2026-07-28 modern
```

第一行是默认握手，旧时代。`timeout 60000` 是 SDK 导出的 `DEFAULT_REQUEST_TIMEOUT_MSEC`：不传 `timeout` 时，一次 `callTool` 最多等 60 秒。最后一行是另一个客户端，构造时加了 `versionNegotiation: { mode: "auto" }`，同一份 `serveStdio` 服务器协商到 `2026-07-28` / `modern`。7.1 节的进程内传输加了同一个选项仍然是 `2025-11-25`。差的不是服务器工厂，是传输做不做得到新握手。

`listTools()` 不传 cursor 时，SDK 把分页拼成完整列表。每个工具有 `name`、可选的 `description`，以及 `inputSchema`。这份 schema 是 JSON，而且带 `$schema`（draft 2020-12）。有的模型服务商会拒收不认识的关键字。适配器拷贝一份再删掉它，不改服务器缓存里的原对象：`listTools` 的结果可能还指着那一份。

## 适配器只看两个方法

`createMcpExecutor` 要的接口是：

```ts
interface McpToolSource {
  listTools(): Promise<{ tools: readonly McpListedTool[] }>;
  callTool(
    params: { name: string; arguments?: Record<string, unknown> },
    options?: { signal?: AbortSignal; timeout?: number },
  ): Promise<McpToolResult>;
}
```

官方 `Client` 的方法多得多，返回值上还有 `_meta`、`ttlMs` 这些字段。TypeScript 的结构化类型只检查你用到的部分，所以 `Client` 能直接传进来。练习里的 `expectTypeOf(client).toExtend<McpToolSource>()` 锁的就是这件事。

写这个接口时踩过 `exactOptionalPropertyTypes`。SDK 里 `description` 的类型是 `string | undefined`（属性可以在，值也可以是 `undefined`）。我们如果写成 `description?: string`，意思是"可以没有，有的话必须是 string"，`undefined` 赋不进去，`tsc` 会说 `Client` 不能赋给 `McpToolSource`。把可选字段写成 `description?: string | undefined` 才接得住。这不是风格问题，是这份配置下的赋值规则。

适配器 **不 import SDK**。谁要连服务器，谁自己装、自己 `connect`。因此 `@learn-ts/agent-kit` 的主入口仍然不依赖这两个包，也不依赖 zod。包的测试扫 `src`，确认没有 `from "@modelcontextprotocol/..."`。7.10 节用第 4 章的拆包标准把"要不要单独一个入口"说完。这里先记住结果：没有新的依赖，就不要为了名字好看拆一个入口。

## 从字符串到对象，再从结果到一段文字

模型给 harness 的 `arguments` 是 JSON **字符串**。`callTool` 要的是对象。中间这几步都是给模型看的失败，不是抛异常：

1. `JSON.parse` 失败：`参数不是合法的 JSON`
2. 解析出来是数组、`null` 或数字：`参数必须是 JSON 对象`
3. 名字对不上前缀，或者根本没有这个工具：`未知工具`，并列出可用的名字
4. `callTool` 返回 `isError: true`：`ok: false`，正文用工具自己的话
5. `callTool` 抛了，且 `signal` 还没中止：`工具执行失败：${message}`
6. `signal` 已经中止：继续抛。收成 `ok: false` 的话，模型会以为工具失败了，可能再试一次。第 6 章的 `runToolCalls` 用"第一个结果为准"，取消已经记成 `cancelled`

正文怎么拼：`text` 块按顺序用换行接起来；别的块写成 `[image]` 这种占位，避免静默丢掉；`structuredContent` 不是 `undefined` 时再追加一行 `JSON.stringify`。什么都没有，用 `（没有内容）`，和空字符串区分开。

前缀用 7.1 节的 `__`。`prefix` 自己含有 `__` 就抛，否则 `"a__b__search"` 拆开时服务器名会错。空字符串和没传一样，不加前缀。调用服务器时用去掉前缀的名字：模型看到的是 `notes__add`，服务器注册的是 `add`。这一步写反了，服务器会回答 `Tool notes__add not found`。

`timeoutMs` 只有在你传了的时候才放进 `callTool` 的选项。不要写成 `timeout: options.timeoutMs`，否则没传的时候字段在，值是 `undefined`。开了 `exactOptionalPropertyTypes` 的调用方，和"这个键不存在"不是同一个意思。

## 一次 dispatch 实际走了什么

模型要调用 `notes__add`，参数字符串是 `{"text":"买牛奶"}`。适配器里的顺序是固定的，换一下就会对不上测试：

1. 用前缀把 `notes__add` 拆回 `add`。前缀对不上，直接 `未知工具`，不再请求服务器
2. `JSON.parse`。失败就是 `参数不是合法的 JSON`，不要让 `JSON.parse` 的异常冒出去
3. 确认结果是普通对象。数组也是对象，所以要先排除 `Array.isArray`
4. 拼 `callTool` 的选项：有 `signal` 才写 `signal`，有 `timeoutMs` 才写 `timeout`。练习会检查没传超时时，选项对象上 **没有** `timeout` 这个键
5. `await source.callTool({ name: "add", arguments: { text: "买牛奶" } }, options)`
6. 按上一节的规则读 `isError` 和内容块

`schemas()` 在 `createMcpExecutor` 返回之前就定下来了。每次调用再 `structuredClone` 一份。测试会改第一次拿到的 `required`，再调一次 `schemas()`，第二次必须还是原来的 `["q"]`。这和工具箱的 `schemas()` 一样：交出去的描述会被人改，库里的那份不能跟着变。

类型测试写的是 `expectTypeOf(client).toExtend<McpToolSource>()`。一开始写成 `description?: string` 时，`tsc` 的错误是 `Client` 不能赋给这个接口，因为 `description` 的 `string | undefined` 对不上。改接口，不改 SDK。

## 取消停的是客户端这一侧

我们看过服务器处理函数的第二个参数，键只有 `sessionId`、`mcpReq`、`http`，没有 `AbortSignal`。客户端的 `signal` 中止之后，`callTool` 的 Promise 会以 `SdkError` 拒绝，消息里带 `AbortError`。服务器里的函数不会因此停下来：已经开始的 `await` 还会跑完。stdio 子进程要靠 `client.close()` 结束，不要假设取消会杀掉对方。

这和 [6.3 节](../06-harness/03-parallel-tools.md) 是同一件事。取消是请求，不是命令。harness 能做的是不再等，并把这次调用记成取消。

## 停下来想一想

1. 为什么适配器删 `$schema` 之前要先拷贝？直接 `delete tool.inputSchema.$schema` 会坏在哪？
2. 参数校验失败（`isError: true`）和用户按下取消（`signal.aborted`），适配器一个收成 `ok: false`，一个继续抛。如果两个都抛，或者两个都收成 `ok: false`，模型或 harness 会怎么误解？

## 小结

- `StdioClientTransport` 负责启动和关闭子进程。stderr 默认继承到父进程；测试里改成管道
- 默认 stdio 握手是 `2025-11-25`。`versionNegotiation: { mode: "auto" }` 在 stdio 上可以到 `2026-07-28` / `modern`。`callTool` 的默认超时是 60 秒
- 官方 `Client` 结构上符合 `McpToolSource`。可选字段要写成 `T | undefined`，才能过 `exactOptionalPropertyTypes`
- 适配器不 import SDK，所以主入口没有这份依赖
- 非法 JSON 和 `isError` 是结果；取消继续抛。服务器里的处理函数不会因为客户端取消而自动停

## 练习

[exercises/07-extensions/03-mcp-client.ts](../../exercises/07-extensions/03-mcp-client.ts)：实现 `createMcpExecutor`。运行 `pnpm ex 03-mcp-client`。空前缀不能变成 ` __name`，没传 `timeoutMs` 时选项里不能出现 `timeout` 这个键。

下一节：[7.4 子 agent：委托](04-delegation.md)
