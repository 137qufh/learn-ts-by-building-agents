# 7.10 章末项目：接到 agent-kit

> 这一节要解决的问题：前九节是零件。哪些放进包里，哪些留在演示里？版本号为什么是 0.4.0，而不是 0.3.1，也不是单独一个 `@learn-ts/agent-kit/mcp`？

演示程序：[project/demo.ts](project/demo.ts)

## 一次运行里有三种工具

[exercises/07-extensions/project/studio.ts](../../exercises/07-extensions/project/studio.ts) 做两件事。

`mergeTools` 把多个 `ToolExecutor` 合成一个。名字在调用的那一刻就固定：逐个读 `schemas()`，重名立刻抛 `工具 "..." 重复了`，空数组抛"至少要有一个"。之后某一边的 `schemas()` 变了，合成的结果不跟着变。`schemas()` 每次返回新的拷贝，调用方改返回值，下一次还是原来的描述。未知工具的 `dispatch` 是 `ok: false`，正文里有可用的名字，和工具箱的说法一样。

`runStudio` 用这个合成器把三样放进同一次 `createAgent`：

1. `createMcpExecutor(client, { prefix: "notes" })`。模型看到的是 `notes__add_note`，服务器注册的是 `add_note`
2. 本地的 `remember` / `recall`，背后是 `createRetriever`。`recall` 最多 3 条，没有就是 `没有找到`
3. `summarize`。它 `delegate` 一个没有工具的子 agent，system 是"用一句话总结用户给出的任务，不要调用工具。"完成时 `ok: true`，没完成时 `ok: false`，正文都是 `parentSummary`

子 agent 的请求里只有它自己的 system 和这一次任务。父对话的工具结果不在里面。这是 7.4 节的隔离，用练习锁住，不是只在演示里看一眼。

`runStudio` 不关闭传入的客户端。连接是调用方打开的，谁打开谁关闭。函数里 `close`，调用方在 `finally` 里再 `close` 一次，第二次的行为就得靠 SDK 容不容易报错。

## 为什么适配器在主入口

写之前考虑过 `@learn-ts/agent-kit/mcp`，理由和第 5 章把 zod 拆出去一样：SDK 是一个不小的依赖，不该加给只用 `createAgent` 的人。写完才发现适配器不 import SDK。它只要求 `listTools` 和 `callTool`。官方 `Client` 结构上符合，谁用谁自己装。

用 [4.7 节](../04-tooling/07-monorepo.md) 的三条再量一次：

- **不同的使用者？** 用 harness 的人，就是会接工具的人。没有另一群"只要向量、不要 agent"的调用方需要单独发一个包
- **不同的依赖？** 主入口没有新的运行时依赖。测试扫描 `src`，确认没有 `from "zod"`，也没有 `from "@modelcontextprotocol/..."`。zod 仍然只在 `./zod`。MCP 的包是仓库的 devDependency，给示例、练习和"Client 赋得进去"的类型测试用
- **想强制边界？** 文件已经按职责分开：`mcp-tools.ts`、`delegate.ts`、`orchestrate.ts`、`share-context.ts`、`compact.ts`、`memory.ts`、`retrieve.ts`、`eval.ts`、`merge-tools.ts`。拆包不会让边界比现在更硬

三条都不成立，所以 0.4.0 加在主入口，没有新的 `exports` 路径。`./zod` 和 `./testing` 导出的名字一个没变。

## 版本号

和 5.7、6.9 节同一套规则（[4.3 节](../04-tooling/03-publishing.md)）：

- 新增的是公开函数：`createMcpExecutor`、`delegate`、`parentSummary`、`shareContext`、`orchestrate`、`compactMessages`、`createMemoryStore`、`createRetriever`、`createLocalEmbedder`、`cosine`、`mergeTools`、`runEval`、`parseJudge`、`compareBaseline`
- 原有的名字、参数、行为都没有改，也没有删
- 0.x 里，新增公开名字是 **minor**。所以是 0.4.0，不是 0.3.1。0.3.1 是只修 bug
- 写着 `^0.3.0` 的依赖 **不会** 自动升到 0.4.0。0.x 的插入符只在同一 minor 里升级。这是故意的：0.x 允许每次 minor 都加东西，调用方要显式改版本

包的测试列出每一个导出的值。增删一个都要改那张表，也要改版本号。表是规格，不是快照。

## 哪些函数公开，哪些不公开

主入口新增的值就是上面那一张。有几个刻意没导出：

- 分词函数。记忆和检索用的是同一套规则，但它是实现。改成另一种切分不应该升级 minor 以外的契约；调用方依赖的是 `search` 的行为，测试锁的是"牛奶能命中买牛奶"，不是函数名字
- 编排循环里的提示句子、`parentSummary` 以外的文案格式。`parentSummary` 导出了，是因为父模型读的就是这句，改它等于改行为。其余句子留在文件里
- 笔记服务器。它依赖练习里的业务，不是 harness 的一部分，和 6.9 节没把文件工具放进包是同一条

`createMemoryStore` 和 `createRetriever` 都导出。工作室用的是检索那一个：要的是排序，不是把库全列出来。只有重叠计数、没有向量的那一个，留给不需要 `Embedder` 的调用方。两个都留着，是因为它们回答的问题不一样，不是因为舍不得删。

## 演示里实际发生的事

```sh
pnpm tsx --conditions=@learn-ts/source chapters/07-extensions/project/demo.ts
```

默认不联网。脚本化的模型先并行调用 `notes__add_note` 和 `remember`，再 `recall` 和 `summarize`，最后一句话结束。进程内的笔记服务器收到的是"买牛奶"。`recall` 的查询是"低脂"，二字片段命中"偏好低脂"。子 agent 返回"买低脂牛奶。"。结束原因是 `completed`。

工具结果在界面上的先后，不一定是模型请求的先后。第 6 章的并行执行谁先完成谁先打出 `tool_result` 事件；写进记录的顺序仍然是调用的顺序。看到 `remember` 的勾出现在 `add_note` 前面，不是前缀或适配器把顺序弄反了。

设置 `OPENAI_API_KEY` 和 `OPENAI_MODEL`（可选 `OPENAI_BASE_URL`）时，同一个程序改用真正的模型。这时没有固定的工具轨迹，它只把事件打出来。不要在 CI 里打开这个开关。评测要钉轨迹，用 7.8 的假模型和断言。

## 这一章没有做的

- 不实现 MCP 的 HTTP 传输和 OAuth。stdio 和进程内已经够把工具接到 harness。那两样是部署
- 不实现 2026-07-28 的 `input_required`（服务器在工具结果里反过来向客户端要输入）。`listTools` / `callTool` 在两代上够用
- 不把本地哈希向量说成 embedding 模型。接口留成 `Embedder`

0.x 的版本号可以对照着读。0.3.0 加上一个不改变旧名字的函数，按 semver 在 0.x 里是 minor，得到 0.4.0。修一个 `isError` 判断写反了的 bug、不改公开签名，才是 0.4.1。删掉 `delegate` 或改它的参数，在 0.x 里仍然可以用 minor，但调用方会坏；那种情况要把破坏写进说明，而不是藏进补丁号。`^0.3.0` 能升到 0.3.9，不能升到 0.4.0。这是 npm 对 0.x 的规则，不是这个包的特例。

## 停下来想一想

1. 适配器不 import SDK，主入口为什么仍然可以接收官方的 `Client`？如果哪天适配器改成 `import { Client } from "@modelcontextprotocol/client"`，4.7 节的哪一条就成立了，版本号该怎么变？
2. `createMcpExecutor` 在创建时把工具列表固定下来。服务器后来新增一个工具，模型看得到吗？这个状态该放在适配器里，还是每次 `schemas()` 都重新 `listTools`？两种的代价是什么？

演示和练习用的是同一套离线路径：进程内的 `InMemoryTransport`，脚本化的模型，检索不联网。stdio 的示例在 7.3 节，示例测试会把它拉起来再关掉，不留下端口。设置 `OPENAI_API_KEY` 和 `OPENAI_MODEL` 才换 `createClient`，可选 `OPENAI_BASE_URL`。那个分支没有黄金轨迹，只把事件打出来，所以它不在 CI 的断言里。CI 跑的是 `pnpm check`：类型、格式、lint，以及用参考答案跑的测试。

`mergeTools([])` 抛"至少要有一个"。合成之后改返回的 `description`，再叫一次 `schemas()`，描述还是原来的。这两条和工具箱相同，工作室的测试也钉了。漏掉拷贝，调用方的修改会写进下一次发给模型的工具表。

公开函数的名单在 `packages/agent-kit/test/agent-kit.test.ts` 里用排序后的 `Object.keys` 钉死。给主入口加一个值而不改这张表，包的测试会红。这是 4.3 节"导出即承诺"在这个仓库里的具体做法，不是写测试时顺便生成的快照。

## 小结

- 一次运行可以同时有带前缀的 MCP 工具、检索和子 agent。子 agent 看不到父对话
- `mergeTools` 在合成时定下名字，交出去的 schema 是拷贝
- 零件进主入口，因为没有新的依赖，也没有另一群使用者。0.4.0 只增加公开函数
- 真正的模型是可选项。测试和默认演示离线

参考答案和包里的实现是两份。练习测试打的是 `solutions/`，包的测试打的是 `src/`。两边的 `mergeTools`、`delegate`、检索公式要一起改。只改练习答案、忘了包，演示会和 `pnpm ex` 不一致。

## 练习

[exercises/07-extensions/project/studio.ts](../../exercises/07-extensions/project/studio.ts)。运行 `pnpm ex project/studio`，或者 `pnpm ex 07-extensions` 运行本章全部练习。

回到[本章目录](README.md)。
