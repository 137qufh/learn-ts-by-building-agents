# 7.2 写一个 MCP 服务器

> 这一节要解决的问题：协议知道了，服务器的代码该怎么写？参数不合法时，是抛异常还是返回一个错误结果？日志写到哪里？

示例代码：[examples/02-mcp-server.ts](examples/02-mcp-server.ts)

## 一个工具就是 schema 加函数

```ts
const server = new McpServer({ name: "notes", version: "1.0.0" });

server.registerTool(
  "add_note",
  {
    description: "保存笔记",
    inputSchema: z.object({ text: z.string().min(1) }),
  },
  async ({ text }) => {
    return { content: [{ type: "text", text: `已保存 ${text}` }] };
  },
);
```

`inputSchema` 是 Zod schema。SDK 用它做三件事：推导处理函数的参数类型、生成给客户端的 JSON Schema、在调用你的函数之前检查参数。示例里 `text` 传空字符串，处理函数的计数器仍然是 0，返回的是：

```text
invalid true 0
```

`isError: true`，正文是 SDK 写的校验说明。模型读得到，可以改参数再试。这和 [5.5 节](../05-validation/05-model-output.md) 把校验错误交还给模型是同一件事，只是 SDK 替你做了第一道。

找不到笔记这种 **预料之中** 的失败，自己返回 `{ isError: true, content: [...] }`，把话说清楚。处理函数里 `throw` 也会变成 `isError: true`，正文是异常的 message。那是没想到的失败。两种都不会让 `callTool` 抛出去。工具名根本不存在时才会抛 `ProtocolError`：那是协议错误，不是工具的结果。

资源用 `registerResource`，按 URI 读。提示用 `registerPrompt`，返回的是一段消息，不是一个副作用。示例把三样都走了一遍。旧的写法是把字段 schema 直接放进一个对象（`{ text: z.string() }`），SDK 标成了 deprecated：用 `z.object({ ... })`。

## 状态放在哪

笔记列表放在 `createNotesServer` 的函数体里，不要放在模块顶层。两个服务器各记各的，测试才能并行，请求之间也不会串。这和第 6 章"agent 没有状态、状态在调用方"是同一条原则，只是服务器自己的数据得有个地方放。

## stdout 是协议，不是日志

stdio 传输时，客户端把服务器当子进程，stdin 收请求，stdout 回响应。`console.log` 会写进这条管道，对方解析 JSON 时直接失败。日志用 `console.error`，走 stderr。

`serveStdio(createServer)` 负责这条管道。它接受一个工厂：每次连接用工厂造一个服务器。进程内测试不要调用它，用上一节的 `InMemoryTransport`。stdin 一旦结束，stdio 服务器会退出，所以测试里把服务器跑在主进程会挂住，或者在 stdin 被关掉时立刻结束。

## 小结

- `registerTool` 的 schema 在你的函数之前拒绝非法参数，并以 `isError` 交给调用方
- 预料之中的失败用 `isError` 把话说清楚；`throw` 留给没想到的失败；未知工具名才会抛
- 服务器的状态放在工厂函数里。stdout 只留给协议

## 练习

[exercises/07-extensions/02-mcp-server.ts](../../exercises/07-extensions/02-mcp-server.ts)：实现 `createNotesServer`。运行 `pnpm ex 02-mcp-server`。

下一节：[7.3 客户端，接到 harness](03-mcp-client.md)
