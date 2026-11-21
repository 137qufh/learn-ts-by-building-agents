# Learn TypeScript by Building Agents

> 从零学 TypeScript，一路做到能自己写一个 Agent Harness。
> Learn TypeScript from zero by building an AI agent harness, step by step.

## 这个仓库是什么

我正在学习 agent harness 开发，但之前不会 TypeScript。这个仓库记录我系统学习 TS 的全过程：每一章都有讲解、可运行的代码和练习，最后把学到的东西拼成一个真正能用的 agent harness。

如果你也想学 TS、也对 agent 感兴趣，欢迎跟着一起学，提 issue、提 PR 都非常欢迎。

## 学习路线（草案）

| 阶段 | 内容 | 产出 |
| --- | --- | --- |
| 0. 环境 | Node.js、pnpm、tsconfig、运行与调试 | 跑通第一个 `.ts` 文件 |
| 1. 基础 | 类型、接口、联合类型、类型收窄、函数 | 一个命令行小工具 |
| 2. 进阶类型 | 泛型、条件类型、映射类型、`infer`、类型体操 | 类型安全的工具函数库 |
| 3. 异步 | Promise、async/await、流、AbortController | 调用 LLM API 并流式输出 |
| 4. 工程化 | 模块、包管理、测试（Vitest）、lint、构建 | 一个可发布的 npm 包 |
| 5. Schema 与校验 | Zod、JSON Schema、运行时校验 | 类型安全的工具（tool）定义 |
| 6. Agent Harness | 消息循环、工具调用、上下文管理、错误重试 | 最小可用的 agent harness |
| 7. 扩展 | MCP、多 agent、记忆、评测 | 完整项目 |

## 目录结构（计划）

```
chapters/   每章的讲解和示例代码
exercises/  练习题和参考答案
harness/    最终的 agent harness 项目
```

## 参与

- 发现错误或有更好的讲法：开 issue 或 PR
- 想加章节：先开 issue 讨论

## License

MIT
