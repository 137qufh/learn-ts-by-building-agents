# 7.1 协议：JSON-RPC、三种原语、两个时代

> 这一节要解决的问题：每个工具都写在自己的进程里，harness 就得认识每一种调用方式。MCP 想用一个协议把"提供工具的人"和"调用工具的 agent"分开。线上到底在传什么？

示例代码：[examples/01-mcp-protocol.ts](examples/01-mcp-protocol.ts)

## 为什么要有协议

第 6 章的工具是一个 TypeScript 函数。它和 agent 在同一个进程里，类型也是你自己写的。这在练习里刚好。一旦工具是另一个程序（数据库、浏览器、公司内部系统），你就得为每一个发明一套：怎么启动、参数是什么 JSON、错误怎么表示。换一个工具，harness 再改一次。

MCP（Model Context Protocol）把这件事收成一个协议。提供能力的一边是 **服务器**，使用能力的一边是 **客户端**。客户端通常活在有模型的程序里。两边只认协议，不认对方的语言。

协议的载荷是 **JSON-RPC 2.0**：一行一个 JSON 对象，`jsonrpc` 固定是 `"2.0"`。有 `method` 和 `id` 的是请求，对方必须回一个带同样 `id` 的结果或错误。有 `method` 没有 `id` 的是通知，不需要回复。练习 7-1 让你把这几种形状从 `unknown` 里解析出来。这是 [5.1 节](../05-validation/01-trust-boundaries.md) 的同一条边界：线上来的字节先解析，再使用，不要 `as`。

## 三种原语

服务器可以向客户端提供三样东西：

| 原语          | 模型怎么用                | 适合什么                                   |
| ------------- | ------------------------- | ------------------------------------------ |
| 工具 tool     | 模型决定调用，参数是 JSON | 有副作用或需要计算的动作：写笔记、跑查询   |
| 资源 resource | 客户端按 URI 读取         | 已经存在的数据：配置、一篇文档。读，不是做 |
| 提示 prompt   | 客户端取回一段消息模板    | 可复用的说法，参数把空填上                 |

把"读文件"做成工具也能跑，但模型每读一次都要走一轮调用。资源的意思是：这是数据，不是动作。提示的意思是：这段话是给人（或模型）复用的模板，不是一个能改状态的函数。示例里三种都注册了，下一节会看到客户端怎么读。

## 两个时代，我们量过

SDK 现在是 v2，拆成两个包：`@modelcontextprotocol/server` 和 `@modelcontextprotocol/client`。npm 上的 `@modelcontextprotocol/sdk` 是 v1 维护线，新代码不要从它的深层路径（`@modelcontextprotocol/sdk/server/mcp.js` 那种）开始。

协议本身也有两代。默认的 `new Client(...)` 走 2025-11-25 的 `initialize` 握手。示例连的是 `InMemoryTransport.createLinkedPair()`，打印出来是：

```text
version 2025-11-25 legacy
```

这对传输只实现了这一代，给它 `versionNegotiation: { mode: "auto" }` 也还是 `2025-11-25`。stdio 上同一个选项会和 `serveStdio` 协商到 `2026-07-28`（`modern`）。这一章的 `listTools` / `callTool` / `readResource` / `getPrompt` 在两代上是同一套方法，课程用默认握手，不把新一代的 `input_required` 多轮交互展开。

`createLinkedPair()` 的两头必须从 **同一个包** import。client 包和 server 包各带一份传输实现，混用时两边的内部状态对不上。示例从 `@modelcontextprotocol/client` 取出这一对，一头交给 `server.connect`，一头交给 `client.connect`。

## 工具名会撞

两个服务器都可以有 `search`。客户端通常把名字写成 `服务器__工具`。[2.6 节](../02-advanced-types/06-template-literal-types.md) 用模板字面量类型拆过这种字符串：紧跟着字面量的 `infer` 匹配到第一次出现的 `__`。运行时的 `splitToolName` 用 `indexOf` 做同一件事，`"a__b__c"` 拆成服务器 `a` 和工具 `b__c`。

## 小结

- MCP 把"提供工具"和"调用工具"分成服务器和客户端，中间是 JSON-RPC
- 工具是动作，资源是数据，提示是模板
- 当前 SDK 是 `@modelcontextprotocol/server` 和 `@modelcontextprotocol/client`。进程内一对传输协商到 2025-11-25
- 工具名用 `服务器__工具` 避免冲突，按第一次 `__` 切开

## 练习

[exercises/07-extensions/01-jsonrpc.ts](../../exercises/07-extensions/01-jsonrpc.ts)：实现 `parseJsonRpc`、`qualifyToolName`、`splitToolName`，以及对应的模板字面量类型。运行 `pnpm ex 01-jsonrpc`。

下一节：[7.2 写一个 MCP 服务器](02-mcp-server.md)
