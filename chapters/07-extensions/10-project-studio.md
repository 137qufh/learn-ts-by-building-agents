# 7.10 章末项目：接到 agent-kit

> 这一节要解决的问题：前九节是零件。哪些放进包里，哪些留在演示里？版本号为什么是 0.4.0，而不是 0.3.1，也不是 1.0.0？

演示程序：[project/demo.ts](project/demo.ts)

## 要做什么

[exercises/07-extensions/project/studio.ts](../../exercises/07-extensions/project/studio.ts) 两块：

- `mergeTools`：把 MCP 适配器和本地工具合成一个 `ToolExecutor`。名字在合成时确定，重名立刻抛出
- `runStudio`：一次运行里同时有带 `notes__` 前缀的 MCP 笔记工具、`remember` / `recall`（检索），和 `summarize`（子 agent）

运行 `pnpm ex project/studio`。子 agent 的模型请求里不应该出现父对话的工具结果。记住的事实要能被 `recall` 按片段找回来。

参考实现在 [packages/agent-kit](../../packages/agent-kit/)。演示程序用的是包里的函数，不依赖你有没有做完练习。想换成自己的 `runStudio`，把导入改成练习文件。

## 为什么适配器在主入口

写之前考虑过单独的 `@learn-ts/agent-kit/mcp`，理由是 SDK 是一个不小的依赖，和第 5 章把 zod 拆出去一样。写完才发现适配器不 import SDK：它只要求 `listTools` 和 `callTool`。官方 `Client` 结构上符合。SDK 留在调用方。

用 [4.7 节](../04-tooling/07-monorepo.md) 的三条再量一次：

- **不同的使用者？** 用 harness 的人，就是会接工具的人
- **不同的依赖？** 主入口没有新的依赖。测试扫描 `src`，确认没有 `from "zod"`，也没有 `from "@modelcontextprotocol/..."`
- **想强制边界？** 文件已经按职责分开（`mcp-tools.ts`、`delegate.ts`、`eval.ts`……）

三条都不成立，所以 0.4.0 加在主入口，没有新的 `exports` 路径。`./zod` 和 `./testing` 的导出一个没变。

## 版本：0.4.0

和 5.7、6.9 节同一套规则：

- 主入口新增了函数：`createMcpExecutor`、`delegate`、`parentSummary`、`shareContext`、`orchestrate`、`compactMessages`、`createMemoryStore`、`createRetriever`、`createLocalEmbedder`、`cosine`、`mergeTools`、`runEval`、`parseJudge`、`compareBaseline`
- 原有的名字、参数、行为都没有改
- 0.x 里新增公开名字是 **minor**。写着 `^0.3.0` 的依赖不会自动升到 0.4.0

包的测试列出每一个导出的值。增删一个都要改那张表，也要改版本号。

## 演示

```sh
pnpm tsx --conditions=@learn-ts/source chapters/07-extensions/project/demo.ts
```

默认用脚本化的假模型和进程内的笔记服务器，不需要网络。输出里能看到：笔记工具带 `notes__` 前缀，子 agent 的请求只有 system 和这一次任务，`recall` 找到了记住的事实。

设置 `OPENAI_API_KEY` 和 `OPENAI_MODEL`（可选 `OPENAI_BASE_URL`）时，同一个演示改用真正的模型。这时没有固定的工具轨迹，程序只把事件打出来。评测仍然可以拿 7.8 的包含断言跑你保存下来的轨迹；不要在 CI 里调用真正的模型。

## 思考题

1. `createMcpExecutor` 在创建时把工具列表固定下来。服务器后来 `sendToolListChanged`，适配器看不见。列表该存在哪，谁来刷新？
2. 两个 MCP 服务器都有 `search`，前缀解决了名字。模型看到的描述里要不要写上服务器的名字？不写会怎样？
3. 子 agent 的 `messages` 现在只返回给调用方。要把它的 span 挂到父 agent 的追踪下面，该把 `Tracer` 放在 `delegate` 的参数里，还是放在子 agent 自己的选项里？
4. 哈希向量没有同义词。你把 `Embedder` 换成真正的模型之后，7.9 的基线应该怎么更新，才不会把"换了模型"误报成回归？

## 小结

- 零件进主入口，因为没有新的依赖，也没有另一群使用者
- 0.4.0 只增加公开函数。适配器不 import SDK，调用方自己连接
- 同一次运行里可以有 MCP 工具、检索和子 agent。子 agent 看不到父对话
- 真正的模型是可选项。评测和测试默认离线

## 练习

[exercises/07-extensions/project/studio.ts](../../exercises/07-extensions/project/studio.ts)。运行 `pnpm ex project/studio`，或者 `pnpm ex 07-extensions` 运行本章的全部练习。

回到[本章目录](README.md)。
