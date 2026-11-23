# 7.3 客户端，接到 harness

> 这一节要解决的问题：服务器会说话了。harness 认识的是 `ToolExecutor`（`schemas` 和 `dispatch`）。中间差一层适配：列出来的工具怎么变成给模型的函数声明，模型返回的调用怎么变回 `callTool`。

示例代码：[examples/03-mcp-client.ts](examples/03-mcp-client.ts)

## 客户端拥有子进程

stdio 客户端不要自己先把服务器启动起来。`StdioClientTransport` 会 spawn，`connect` 做握手，`close` 关掉子进程。

```ts
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverFile],
  stderr: "pipe",
});
```

`stderr` 的默认值是 `"inherit"`：服务器写到 stderr 的字会出现在你这个进程的 stderr 上。示例改成 `"pipe"`，自己读那一行 `notes server ready`，再打到 stdout。课程的示例测试要求进程自己的 stderr 是空的，管道也让你能断言那行日志真的到了。

默认握手下，这个子进程协商到的版本是 `2025-11-25`。示例打印了它。

`listTools()` 不传 cursor 时，SDK 会把分页拼成完整列表。每个工具有 `name`、`description` 和 `inputSchema`。`inputSchema` 是 JSON Schema，而且带一个 `$schema` 字段（draft 2020-12）。有的模型服务商会拒收不认识的关键字，适配器拷贝一份再删掉它，不改服务器缓存里的原对象。

## 适配器只看两个方法

`createMcpExecutor` 要的是：

```ts
interface McpToolSource {
  listTools(): Promise<{ tools: readonly McpListedTool[] }>;
  callTool(
    params: { name: string; arguments?: Record<string, unknown> },
    options?: { signal?: AbortSignal; timeout?: number },
  ): Promise<McpToolResult>;
}
```

官方的 `Client` 方法多得多，返回值字段也多得多。TypeScript 的结构化类型只检查你用到的部分，所以 `Client` 能直接传进来。可选字段写成 `description?: string | undefined`，是因为开了 `exactOptionalPropertyTypes`：SDK 的类型里这个字段可以是 `undefined`，只写 `description?: string` 接不住。

适配器 **不 import SDK**。谁要连服务器，谁自己装 SDK、自己 `connect`。因此 `@learn-ts/agent-kit` 的主入口仍然不依赖这两个包，也不依赖 zod。包的测试扫源码确认没有这种 import，再用 `expectTypeOf(client).toExtend<McpToolSource>()` 确认官方客户端真的赋得进去。这是 [4.7 节](../04-tooling/07-monorepo.md) 的拆包标准用在反方向：没有新的依赖，就不值得为它单开一个入口。

## 模型给的是字符串，服务器要的是对象

harness 里的 `RawToolCall.arguments` 是 JSON 字符串。`callTool` 的 `arguments` 是对象。非法 JSON、或者 JSON 不是对象（数组、`null`、数字），都变成 `ok: false` 交还给模型，不要抛。`isError: true` 同样是 `ok: false`，正文用工具自己的话。文本块按顺序拼接；图片、资源这类块 harness 只能交字符串，写成 `[image]` 这种占位，避免静默丢掉。`structuredContent` 再追加一行 JSON。

`callTool` 的默认超时是 60 秒。更短的超时用 `timeoutMs` 传进去。

## 取消停的是客户端这一侧

`dispatch` 收到的 `signal` 传给 `callTool`。信号已经中止时，SDK 抛 `SdkError`，消息里带 `AbortError`。这个错误要继续抛。收成 `ok: false` 的话，harness 会以为工具失败了，模型可能再试一次。第 6 章的 `runToolCalls` 用"第一个结果为准"，取消已经记成 `cancelled` 之后，后到的错误会被忽略。

我们看过服务器回调的参数：只有 `sessionId`、`mcpReq`、`http`，没有 `AbortSignal`。客户端取消不会让服务器里的处理函数自动停下来。stdio 子进程要靠 `client.close()` 结束。

## 小结

- `StdioClientTransport` 负责启动和关闭子进程。stderr 默认继承到父进程，测试里改成管道
- 适配器是结构化的 `listTools` / `callTool`，官方 `Client` 直接符合，所以主入口不依赖 SDK
- 参数先解析成对象；`isError` 是结果，取消是异常
- 客户端的取消不会自动停掉服务器里的处理函数

## 练习

[exercises/07-extensions/03-mcp-client.ts](../../exercises/07-extensions/03-mcp-client.ts)：实现 `createMcpExecutor`。运行 `pnpm ex 03-mcp-client`。

下一节：[7.4 子 agent：委托](04-delegation.md)
