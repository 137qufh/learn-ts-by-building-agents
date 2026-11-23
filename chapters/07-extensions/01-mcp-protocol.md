# 7.1 协议：JSON-RPC、三种原语、两个时代

> 这一节要解决的问题：每个工具都写在自己的进程里，harness 就得认识每一种调用方式。MCP 想用一个协议把"提供工具的人"和"调用模型的人"分开。线上到底在传什么，版本号又该看哪一个？

示例代码：[examples/01-mcp-protocol.ts](examples/01-mcp-protocol.ts)

## 为什么要有协议，而不是再写一个函数

第 6 章的工具是一个 TypeScript 函数，和 agent 在同一个进程里。练习里这刚好。工具一旦是另一个程序（数据库、浏览器、公司里已有的服务），每接一个就要约定：怎么启动、参数是什么 JSON、错误长什么样、谁先说话。接三个就有三套约定，harness 里全是 `if (name === "github")`。

MCP（Model Context Protocol）把这件事收成一个协议。提供能力的一边叫 **服务器**，使用能力的一边叫 **客户端**。客户端通常活在有模型的程序里。两边只认协议，不认对方是 TypeScript 还是别的语言。换一个笔记服务，harness 的循环不用改，改的是连上哪一个服务器。

代价也要说清楚。多了一层握手和序列化；类型不再由 `defineTool` 的泛型直接推出来，而是运行时才知道有哪些工具（7.3 节）。进程内的函数调用没有这层成本。协议值得用的时候，是工具的生命周期和 agent 的生命周期不是同一个。

## 一行 JSON 是哪种消息

协议的载荷是 **JSON-RPC 2.0**。`jsonrpc` 固定是 `"2.0"`。SDK 把这个字面量导出为 `JSONRPC_VERSION`。示例里先解析两行，再去连服务器：

```ts
const request = JSON.parse('{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}');
const notification = JSON.parse('{"jsonrpc":"2.0","method":"notifications/initialized"}');
```

打印出来是 `request tools/list 1` 和 `notification notifications/initialized`。差别只有有没有 `id`：

| 形状     | 怎么认                                                      | 对方要不要回                   |
| -------- | ----------------------------------------------------------- | ------------------------------ |
| 请求     | 有非空 `method`，并且有 `id`（字符串或有限数字）            | 要，用同一个 `id` 回结果或错误 |
| 通知     | 有 `method`，没有 `id`                                      | 不要                           |
| 成功响应 | 没有 `method`，有 `result`                                  | 这本身就是回复                 |
| 失败响应 | 没有 `method`，有 `error`（数字 `code` 加字符串 `message`） | 这本身就是回复                 |

这是 [5.1 节](../05-validation/01-trust-boundaries.md) 的同一条边界：线上来的字节是 `unknown`，先解析再使用，不要 `as`。练习里几条容易写错的规则，都是 JSON-RPC 自己的，不是我们发明的：

- 请求的 `id` 不能是 `null`。`null` 只出现在响应里，表示"请求的 id 没能确定"
- 有 `method` 就不能再带 `result` 或 `error`。那一行既像请求又像响应，没法处理
- `error` 里多出来的 `data` 丢掉，只留 `code` 和 `message`。多出来的字段是对方的实现细节
- 没有 `params` 就不要写这个属性。开了 `exactOptionalPropertyTypes` 之后，"没有"和"值是 `undefined`"不是一回事

布尔值当 id、空的 method、数组当整条消息，都应该是 `{ ok: false }`，而不是抛异常。解析函数自己抛，调用方就分不清"这行不是 JSON"和"程序写错了"。

## 三种原语，不要都做成工具

服务器可以向客户端提供三样东西：

| 原语          | 谁来决定用它               | 适合                                           | 不适合                       |
| ------------- | -------------------------- | ---------------------------------------------- | ---------------------------- |
| 工具 tool     | 模型，在某一轮里决定调用   | 有副作用或要计算的动作：写一条笔记、跑一次查询 | 一份已经存在、只是要读的文档 |
| 资源 resource | 客户端按 URI 读            | 配置、一篇文章、目录                           | 会改状态的操作               |
| 提示 prompt   | 客户端取回一段填好空的消息 | 反复使用的说法："按这个格式做代码评审"         | 需要模型现场决定参数的动作   |

把"读这篇文档"做成工具也能跑，但模型每读一次都要花一轮调用，文档内容还进了工具结果，占上下文。资源的意思是：这是数据，客户端可以在问模型之前就读好，放进提示里。提示的意思是：这段话是模板，不是一个函数。示例在下一节把三样都走一遍；这一节先把边界记住。

## 两个时代，常量的名字会骗人

当前要装的是两个包，版本都是本仓库锁住的 **2.4.0**：

```ts
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
```

npm 上还有一个叫 `@modelcontextprotocol/sdk` 的包，那是 v1 的维护线。新代码不要从它的深层路径（`@modelcontextprotocol/sdk/server/mcp.js`）写起。v2 把客户端和服务器拆开了，深层路径也不再对外导出。

协议有两代，SDK 导出的名字容易看反。示例打印的是：

```text
latest constant 2025-11-25
supported has 2026-07-28? false
version 2025-11-25 legacy
```

`LATEST_PROTOCOL_VERSION` 的值是 `"2025-11-25"`。`SUPPORTED_PROTOCOL_VERSIONS` 是 `2025-11-25`、`2025-06-18`、`2025-03-26`、`2024-11-05`、`2024-10-07`。这五个是 **旧时代**（legacy）的修订号，`LATEST_` 指的是这份旧名单里最新的一个，不是"协议的最新一代"。`2026-07-28` 不在这个数组里。

默认的 `new Client(...)` 走旧时代的 `initialize` 握手。和 `InMemoryTransport.createLinkedPair()` 连上之后，`getNegotiatedProtocolVersion()` 是 `2025-11-25`，`getProtocolEra()` 是 `legacy`。给这对传输加上 `versionNegotiation: { mode: "auto" }` 也还是 `2025-11-25`：这条传输只实现了旧握手。stdio 上同一个选项会和 `serveStdio` 协商到 `2026-07-28` / `modern`，7.3 节的示例会打印出来。

SDK 还导出 `DEFAULT_NEGOTIATED_PROTOCOL_VERSION`，值是 `"2025-03-26"`。名字像是"默认会协商到这个版本"。和当前这套服务器握手，得到的不是它。要知道连上了哪一版，读 `getNegotiatedProtocolVersion()`，不要读常量的名字。

`createLinkedPair()` 的两头必须从 **同一个包** import。client 包和 server 包各带一份传输实现，内部状态不共享。混着 import，两边都像连上了，消息却到不了对方。示例从 `@modelcontextprotocol/client` 取出这一对，一头交给 `server.connect`，一头交给 `client.connect`。

这一章用到的 `listTools`、`callTool`、`readResource`、`getPrompt` 在两代上是同一套方法。课程的测试走默认握手。2026 这一代把"服务器反过来问客户端"收成了工具结果里的 `input_required`，那是另一套交互，这里不展开。

## 工具名会撞

两个服务器都可以叫自己的工具 `search`。客户端习惯把暴露给模型的名字写成 `服务器__工具`。[2.6 节](../02-advanced-types/06-template-literal-types.md) 的 `infer` 会匹配到第一次出现的分隔符，所以类型 `SplitToolName<"a__b__c">` 是 `{ server: "a"; tool: "b__c" }`，不是三截。运行时用 `indexOf("__")` 做同一件事。服务器名自己再包含 `__`，或者任一侧是空的，就拆不开，`qualifyToolName` 应该拒绝，而不是生成一个 `split` 看不懂的字符串。

## 停下来想一想

1. 一条消息同时有 `method` 和 `result`。你把它当成请求还是响应？为什么两种都不是？
2. `LATEST_PROTOCOL_VERSION` 和一次真实握手的 `getNegotiatedProtocolVersion()` 会不会总是同一个字符串？stdio 上打开自动协商之后呢？

## 小结

- MCP 把"提供工具"和"调用工具"分成服务器和客户端，中间是 JSON-RPC 2.0
- 请求有 id，通知没有；响应只有 result 或只有 error
- 工具是动作，资源是数据，提示是模板
- 安装 `@modelcontextprotocol/client` 和 `@modelcontextprotocol/server` 2.4.0。导出的 `LATEST_PROTOCOL_VERSION` 是旧时代的 `2025-11-25`；`2026-07-28` 不在 `SUPPORTED_PROTOCOL_VERSIONS` 里
- 进程内一对传输协商到 `2025-11-25` / `legacy`。看版本看握手结果，不看常量名字
- 工具名用 `服务器__工具`，按第一次 `__` 切开

## 练习

[exercises/07-extensions/01-jsonrpc.ts](../../exercises/07-extensions/01-jsonrpc.ts)：实现 `parseJsonRpc`、`qualifyToolName`、`splitToolName`，以及 `QualifiedName` 和 `SplitToolName`。运行 `pnpm ex 01-jsonrpc`。类型测试在 `01-jsonrpc.test-d.ts`。

下一节：[7.2 写一个 MCP 服务器](02-mcp-server.md)
