# 第 7 章：MCP、多 agent、记忆与评测

> 第 6 章的 harness 能跑一个 agent。这一章让它接上别人的工具、把活分给别的 agent、记住这次运行之外的事，并且用评测抓住退步。

一个 agent 写到能用，接下来的问题都出在边界上。工具不一定写在你的进程里：编辑器、数据库、公司内部系统各有各的接口，每接一个就改一次 harness，接不完。一个 agent 什么都做，对话里又是密钥又是工具结果，上下文又贵又容易串。对话结束，它什么都不记得。改了一行提示，你不知道是变好了还是悄悄变差了。

这一章按这个顺序处理：先学 MCP，用官方的 TypeScript SDK 写服务器和客户端，再把客户端适配成第 6 章的 `ToolExecutor`；然后是多个 agent 怎么分工、什么可以传给对方；然后是记忆和离线就能跑的检索；最后是不靠"我看了一眼觉得还行"的评测。全程不需要 API key。想连真正的模型，环境变量和第 3、6 章一样。

## 学完你能

- 说出 MCP 的三种原语（工具、资源、提示）分别解决什么，以及为什么 stdout 不能拿来打日志
- 用当前的 SDK 写一个 MCP 服务器和一个客户端，在进程内或 stdio 上完成握手、列工具、调用工具
- 把官方 `Client` 适配成 harness 的 `ToolExecutor`，处理名字冲突、校验错误和取消
- 写子 agent 和编排：委托和交接的差别，以及哪些上下文不能传过去
- 在不拆开工具调用的前提下折叠旧消息，并用一个不联网的索引做跨运行的检索
- 写确定性的评测：黄金轨迹、量表打分的解析、和基线比有没有退步

## 前置知识

- [第 2 章](../02-advanced-types/README.md)：模板字面量类型。7.1 用它拆 `服务器__工具`
- [第 5 章](../05-validation/README.md)：信任边界、Zod。MCP 的工具参数是不可信输入
- [第 6 章](../06-harness/README.md)：`Model`、`ToolExecutor`、`createAgent`、`isSecretKey`、脚本化的假模型

## 课程目录

| 节   | 内容                                                     | 示例                                                | 练习                                                                  |
| ---- | -------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| 7.1  | [协议：JSON-RPC、三种原语、两个时代](01-mcp-protocol.md) | [01-mcp-protocol.ts](examples/01-mcp-protocol.ts)   | [01-jsonrpc](../../exercises/07-extensions/01-jsonrpc.ts)             |
| 7.2  | [写一个 MCP 服务器](02-mcp-server.md)                    | [02-mcp-server.ts](examples/02-mcp-server.ts)       | [02-mcp-server](../../exercises/07-extensions/02-mcp-server.ts)       |
| 7.3  | [客户端，接到 harness](03-mcp-client.md)                 | [03-mcp-client.ts](examples/03-mcp-client.ts)       | [03-mcp-client](../../exercises/07-extensions/03-mcp-client.ts)       |
| 7.4  | [子 agent：委托](04-delegation.md)                       | [04-delegation.ts](examples/04-delegation.ts)       | [04-delegate](../../exercises/07-extensions/04-delegate.ts)           |
| 7.5  | [交接、编排、共享上下文](05-orchestration.md)            | [05-orchestration.ts](examples/05-orchestration.ts) | [05-orchestration](../../exercises/07-extensions/05-orchestration.ts) |
| 7.6  | [记忆：折叠和长期存储](06-memory.md)                     | [06-memory.ts](examples/06-memory.ts)               | [06-memory](../../exercises/07-extensions/06-memory.ts)               |
| 7.7  | [检索：关键词和本地向量](07-retrieval.md)                | [07-retrieval.ts](examples/07-retrieval.ts)         | [07-retrieval](../../exercises/07-extensions/07-retrieval.ts)         |
| 7.8  | [评测：确定性用例](08-evals.md)                          | [08-evals.ts](examples/08-evals.ts)                 | [08-evals](../../exercises/07-extensions/08-evals.ts)                 |
| 7.9  | [评判与回归](09-judge.md)                                | [09-judge.ts](examples/09-judge.ts)                 | [09-judge](../../exercises/07-extensions/09-judge.ts)                 |
| 7.10 | [章末项目：接到 agent-kit](10-project-studio.md)         | [project/demo.ts](project/demo.ts)                  | [project/studio](../../exercises/07-extensions/project/studio.ts)     |

7.1 到 7.3 是一条线，按顺序读。7.4 和 7.5 是多 agent。7.6 和 7.7 是记忆。7.8 和 7.9 是评测。章末项目把 MCP、子 agent 和检索接到同一次运行里。

## 关于这一章的练习

- 每道练习都可以单独运行，例如 `pnpm ex 03-mcp-client`；`pnpm ex 07-extensions` 运行本章全部练习
- MCP 的练习使用官方 SDK 2.4（`@modelcontextprotocol/server` 和 `@modelcontextprotocol/client`）。测试走进程内传输，不启动端口，不需要 API key
- 练习 7-1 有类型测试，检查工具名的模板字面量类型
- 假模型仍然用第 6 章的 `createScriptedModel`。评测断言的是轨迹和文本，不是某一次网络请求

## 章末项目

`runStudio` 把一个已经连上的 MCP 客户端、一个检索索引和一个只会总结的子 agent 合成一次 `createAgent` 运行。参考答案里的可复用部分发布进 `@learn-ts/agent-kit` 0.4.0：`createMcpExecutor`、`delegate`、`shareContext`、`orchestrate`、`compactMessages`、`createMemoryStore`、`createRetriever`、`runEval`、`parseJudge`、`compareBaseline`、`mergeTools`。适配器不 import SDK，主入口因此仍然不依赖它，也不依赖 zod。

## 自测清单

1. 工具、资源、提示，各给模型什么？为什么"把文件内容做成一个工具"往往是错的？
2. 为什么 MCP 服务器不能 `console.log`？`StdioClientTransport` 的 stderr 默认是什么？
3. `InMemoryTransport.createLinkedPair()` 协商到的协议版本，和 stdio 上 `versionNegotiation: { mode: "auto" }` 协商到的，我们量到的分别是什么？
4. 参数校验失败时 `callTool` 会抛异常吗？工具名不存在呢？
5. 取消客户端的 `signal` 之后，服务器里的处理函数会自动停下来吗？
6. 为什么适配器不 import SDK，却仍然能传入官方的 `Client`？
7. 子 agent 为什么不能看到父对话？`createAgent` 自己的 system 提示会不会被背景盖掉？
8. 委托和交接，对"谁来面对用户"有什么不同？
9. 为什么共享上下文用允许名单，再加上 `isSecretKey`，而不是写一条包含 `token` 的正则？
10. 折叠旧消息时，为什么不能从某一条 tool 结果切开？
11. 本地哈希向量解决了什么、解决不了什么？什么时候必须换成真正的 embedding 模型？
12. 确定性断言和 LLM 当裁判，各该用在什么上？裁判的分数为什么不能直接当回归标准？

## 这一章没有做的

- 不实现 MCP 的 HTTP 传输、OAuth 和 2026-07-28 的 `input_required` 多轮交互。stdio 和进程内已经够把工具接到 harness；那两样是部署和协议演进，不是类型和循环的问题
- 不接各家模型的原生接口。第 3 章的客户端仍然是 OpenAI 兼容的 `/chat/completions`。MCP 解决的是工具从哪来，不是换一家模型协议
- 本地向量不是 embedding 模型。接口留成 `Embedder`，换真正的模型时不用改检索的调用方

回到[课程目录](../../README.md)。
