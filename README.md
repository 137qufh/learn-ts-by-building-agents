# Learn TypeScript by Building Agents

> 从零学 TypeScript，一路做到能自己写一个 Agent Harness。
> Learn TypeScript from zero by building an AI agent harness, step by step.

## 这个仓库是什么

一门 **以做 agent 为主线** 的 TypeScript 系统课程。从安装 Node.js 开始，到类型系统、异步、工程化、运行时校验，最后亲手写出一个能调用工具、管理上下文、处理错误的 agent harness。

它起源于我自己的学习过程：我想学 agent harness 开发，但之前不会 TypeScript。市面上的 TS 教程大多面向前端，而 agent 开发需要的是另一套重点：可辨识联合建模消息、`unknown` 处理不可信的模型输出、异步流、运行时校验……所以我决定把这条路线完整地整理出来。如果你也想学 TS、也对 agent 感兴趣，欢迎一起学。

## 有什么不一样

- **每个例子都和 agent 有关**：token 用量、模型 ID、重试退避、停止原因、内容块、工具参数、聊天记录……学完类型系统，你手里已经有了 harness 的半成品
- **测试驱动的练习**：每道题都有写好的测试，你写代码让它从红变绿；参考答案放在单独的目录，附带"为什么这样写"的讲解
- **每一行代码都被验证过**：所有示例和答案都通过 `tsc` 严格检查和测试；讲解中"这里会报错"的地方用 `@ts-expect-error` 标注，如果哪天不再报错，检查就会失败，提醒我们更新讲解
- **当前的 TypeScript**：基于 TypeScript 7 和 Node.js 24+，使用最严格的配置，不教已经过时的写法
- **讲"为什么"**：不只是语法清单，而是每个特性解决什么问题、什么时候该用、常见的坑在哪里

## 快速开始

需要 [Node.js](https://nodejs.org/) 24+ 和 [pnpm](https://pnpm.io/)（详细步骤见[第 0 章](chapters/00-setup/01-node-and-pnpm.md)）。

```bash
git clone https://github.com/137qufh/learn-ts-by-building-agents.git
cd learn-ts-by-building-agents
pnpm install

pnpm tsx chapters/00-setup/examples/01-hello.ts   # 运行一个示例
pnpm ex 00-setup                                  # 开始做第 0 章的练习
```

## 学习路线

| 章  | 内容                                                                                                  | 章末项目                         | 状态      |
| --- | ----------------------------------------------------------------------------------------------------- | -------------------------------- | --------- |
| 0   | [环境](chapters/00-setup/README.md)：Node.js、pnpm、tsc / tsx / node、tsconfig、调试                  | Echo Agent：命令行聊天循环       | ✅ 已完成 |
| 1   | [类型基础](chapters/01-basics/README.md)：对象、数组、函数、字面量、联合与收窄、unknown               | 聊天记录（transcript）类型模型   | ✅ 已完成 |
| 2   | [进阶类型](chapters/02-advanced-types/README.md)：泛型、keyof、映射与条件类型、infer、调试类型错误    | 类型安全的工具注册表             | ✅ 已完成 |
| 3   | [异步与流式](chapters/03-async/README.md)：Promise、async/await、错误处理、并发、取消、重试、流与 SSE | 流式 LLM 客户端                  | ✅ 已完成 |
| 4   | [工程化](chapters/04-tooling/README.md)：模块、exports、构建与发布、声明文件、lint、测试、monorepo    | 工作区里的包 @learn-ts/agent-kit | ✅ 已完成 |
| 5   | [Schema 与校验](chapters/05-validation/README.md)：Zod、JSON Schema、运行时校验                       | 类型安全的工具（tool）定义       | ✅ 已完成 |
| 6   | Agent Harness：消息循环、工具调用、上下文管理、错误重试                                               | 最小可用的 agent harness         | 📝 编写中 |
| 7   | 扩展：MCP、多 agent、记忆、评测                                                                       | 完整项目                         | 计划中    |

## 怎么学

每一章的结构都一样：

1. **读课程**：`chapters/<章>/` 下按编号排列的 `.md` 文件
2. **跑示例**：每节配有可运行的示例，`pnpm tsx <文件>` 运行，打开文件对照着改一改
3. **做练习**：`pnpm ex <练习名>` 以监听模式运行测试，编辑 `exercises/` 下的文件直到全部变绿。从第 2 章开始，很多练习还配有类型测试（`*.test-d.ts`），检查你写的类型本身对不对
4. **对答案**：做完再看 `solutions/` 下的参考答案和讲解
5. **做项目**：每章最后有一个把本章知识串起来的小项目

刚克隆下来时，`pnpm ex` 全是红的，这是正常的：那些是等你完成的练习。

## 目录结构

```
chapters/    每章的课程（.md）、示例（examples/）、项目入口（project/）
exercises/   练习题和测试：你动手的地方
solutions/   参考答案
tests/       仓库自检：示例都能运行、每道题都有答案、文档链接都有效
docs/        写作约定
```

## 常用命令

| 命令              | 作用                                                     |
| ----------------- | -------------------------------------------------------- |
| `pnpm ex [过滤]`  | 运行练习测试（监听模式），用的是你在 `exercises/` 的代码 |
| `pnpm ex:types`   | 用 `tsc` 检查练习里的类型测试，输出完整的类型错误信息    |
| `pnpm tsx <文件>` | 运行一个 TS 文件                                         |
| `pnpm typecheck`  | 用 `tsc` 检查整个仓库的类型                              |
| `pnpm test`       | 运行全部测试（练习测试使用参考答案）                     |
| `pnpm lint`       | 用 ESLint 检查代码（第 4 章讲）                          |
| `pnpm check`      | 提交前检查：typecheck + 格式 + lint + 测试               |

## 参与

发现讲错的地方、读不懂的段落，或者有更好的讲法，都欢迎开 issue 或 PR。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

MIT
