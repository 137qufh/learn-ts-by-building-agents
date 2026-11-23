# 7.2 写一个 MCP 服务器

> 这一节要解决的问题：协议知道了，服务器的代码怎么写？参数不合法的时候，是抛异常，还是返回一个模型读得懂的错误？日志写到哪里才不会把协议写坏？

示例代码：[examples/02-mcp-server.ts](examples/02-mcp-server.ts)

## 注册一个工具：schema 在函数之前

```ts
const server = new McpServer({ name: "notes", version: "1.0.0" });

server.registerTool(
  "add_note",
  {
    description: "保存笔记",
    inputSchema: z.object({ text: z.string().min(1) }),
  },
  async ({ text }) => {
    saved += 1;
    return { content: [{ type: "text", text: `已保存 ${text}` }] };
  },
);
```

`inputSchema` 是一个 Zod schema。SDK 用这一份做三件事，和 [5.7 节](../05-validation/07-project-zod-tools.md) 的工具箱是同一条路：

1. 推导处理函数的参数类型。`text` 是 `string`，不用自己写
2. 生成给客户端的 JSON Schema。`listTools` 看到的 `inputSchema` 就是从这里来的
3. 在调用你的函数 **之前** 检查参数

示例把 `text` 传成空字符串。处理函数开头的 `saved += 1` 没有执行，计数器还是 0，返回值上 `isError === true`：

```text
invalid true 0
```

模型读到的是 SDK 写的校验说明（`Input validation error: ...`），可以改参数再试。这比抛到 harness 外面有用：工具失败是预料之中的（[3.4 节](../03-async/04-error-handling.md)），模型需要的是一段文字，不是一个没人接的异常。

旧写法是把字段直接放进一个对象：`inputSchema: { text: z.string() }`。SDK 仍接受，但标成了 deprecated。用 `z.object({ ... })`。本仓库的 Zod 是第 4 版，`import { z } from "zod"` 和 SDK 内部用的是同一套 schema。

## 三种失败，不要混成一种

| 情况                             | 你怎么写                                   | `callTool` 的结果                                                           |
| -------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| 参数不符合 schema                | 不用写，SDK 在进函数之前拒绝               | `isError: true`，正文是校验说明，函数没跑                                   |
| 预料之中的失败，比如没有这条笔记 | `return { isError: true, content: [...] }` | `isError: true`，正文是你写的那句                                           |
| 没想到的失败，比如磁盘满了       | `throw new Error("disk full")`             | 也变成 `isError: true`，正文就是 `"disk full"`。我们量过，前面没有 `Error:` |
| 工具名根本不存在                 | 不用写                                     | `callTool` **抛** `ProtocolError`，消息是 `Tool nope not found`             |

第三行和第四行的差别是这一节最容易写错的地方。`throw` 看起来像"失败了就抛"，SDK 会把它收成一条工具结果，模型还能读。名字不存在是协议错误：客户端问了一个服务器没注册的方法，这不是工具自己的业务失败，所以它抛出去。适配器（7.3 节）要把这两种分开：`isError` 收成 `ok: false`，协议错误在取消之外也收成文字，免得整个 agent 循环崩掉。

找不到笔记时自己写 `isError`，是为了把话说定。`throw new Error("没有笔记 n9")` 碰巧也能得到同样的正文，但那是靠 SDK 的兜底。兜底的文案以后可以改；你返回的那句是规格。练习要求的就是这句 `没有笔记 ${id}`。

## 状态放在工厂里，不要放在模块顶层

```ts
export function createNotesServer(): McpServer {
  const notes: Note[] = [];
  let next = 1;
  const server = new McpServer({ name: "notes", version: "1.0.0" });
  // registerTool 的闭包读的是上面的 notes
  return server;
}
```

两个 `createNotesServer()` 各有自己的数组。测试可以并行，请求之间也不会串。模块顶层的 `const notes = []` 看起来省事，第二个服务器会看见第一个写下的笔记，测试还要记得清空。这和第 6 章"agent 不保存对话，状态在调用方"是同一条原则：谁的生命周期，状态就放在谁里面。服务器活得比一次调用长，笔记就放在创建服务器的函数里。

`list_notes` 的 `tag` 是可选的。不传就列出全部；传了就用 `tags.includes(tag)`，不是子串匹配。`"工"` 不应该命中 `"工作"`。没给 `tags` 的笔记，标签是空数组，行的格式是 `n1 [] 买面包`。空列表的正文是 `（没有笔记）`，不要返回空字符串：空字符串和"我忘了写返回值"分不清。

## 资源和提示不是工具

```ts
server.registerResource(
  "about",
  "notes://about",
  { title: "关于", mimeType: "text/plain" },
  async (uri) => ({ contents: [{ uri: uri.href, text: "a notes server" }] }),
);

server.registerPrompt(
  "summarize",
  { description: "总结", argsSchema: z.object({ topic: z.string() }) },
  ({ topic }) => ({
    messages: [{ role: "user", content: { type: "text", text: `Summarize ${topic}` } }],
  }),
);
```

资源按 URI 读，`readResource` 拿到的 `contents` 是一个数组：同一条 URI 可以有文本，也可以有二进制。读的时候用 `"text" in part` 收窄，不要假设每一段都有 `text`。提示返回的是消息，不是副作用。示例的输出是 `about a notes server` 和 `prompt Summarize milk`。

注册了什么，服务器的能力列表里就有什么。只注册工具，`getServerCapabilities()` 里就有 `tools`；再加上资源，才有 `resources`。不用自己填 capabilities 对象。

## stdout 是协议

stdio 传输时，客户端把服务器当子进程：stdin 上收请求，stdout 上回响应。`console.log` 写进 stdout，对方解析 JSON 时第一行就失败。日志用 `console.error`，走 stderr。`serveStdio(createServer)` 接受一个工厂，由它负责这条管道；连接结束、stdin 关掉，进程就该退出。

所以这一章的测试 **不** 在主进程里调用 `serveStdio`。测试的 stdin 是关着的，服务器会马上退出，或者一直占着进程。进程内用上一节的 `InMemoryTransport`。stdio 留到下一节，由客户端把服务器拉起来。

## 停下来想一想

1. 参数是空字符串时，处理函数里的计数器为什么还是 0？如果改成在函数里自己 `if (text === "") throw ...`，计数器会怎样？
2. `throw new Error("disk full")` 和 `callTool({ name: "没有这个" })`，哪一个会让 `await callTool` 抛异常？

## 小结

- `registerTool` 的 Zod schema 在函数之前拒绝非法参数，并以 `isError` 交给调用方
- 预料之中的失败自己写 `isError` 和文案；`throw` 也会变成 `isError`，正文是 `error.message`；未知工具名才会抛 `ProtocolError`
- 服务器的状态放在工厂函数的闭包里。两个实例互不影响
- 资源是按 URI 读的数据，提示是填好的消息模板
- stdout 只留给协议。测试用进程内传输，不在主进程里 `serveStdio`

## 练习

[exercises/07-extensions/02-mcp-server.ts](../../exercises/07-extensions/02-mcp-server.ts)：实现 `createNotesServer`。运行 `pnpm ex 02-mcp-server`。空文本不能增加笔记，两个服务器不能共享列表，没有的 id 要返回 `没有笔记 ${id}`。

下一节：[7.3 客户端，接到 harness](03-mcp-client.md)
