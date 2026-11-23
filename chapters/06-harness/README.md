# 第 6 章：Agent Harness

> 课程的核心：把模型、工具和对话记录组装成一个真正能用的 agent harness。主循环、并行执行工具、上下文预算、停止条件、错误恢复、流式事件、中间件、追踪，以及用脚本化的假模型做确定性测试。

前五章做好了所有的原料：类型安全的聊天记录（第 1 章）、工具注册表（第 2 章）、流式客户端和取消（第 3 章）、一个能发布的包（第 4 章）、用 Zod 校验的工具（第 5 章）。这一章把它们连起来，回答写 agent 时最实际的问题：模型要调用工具时谁来执行、五个工具能不能一起跑、一个工具卡住了怎么办、对话太长塞不进上下文怎么办、什么时候该停、出错了怎么收拾、界面怎么实时显示、怎么在不改主循环的情况下加上"写文件前先问我"、出了问题怎么知道时间花在了哪里，以及：**这一切怎么在不联网的情况下测试**。

先写出最小的主循环；马上做一个按脚本回复的假模型，之后每一节都用它写确定性的测试；然后逐个加上并行工具、上下文管理、停止与恢复、事件流、中间件和追踪。章末项目把八个零件组装成 `createAgent`，整合进 `@learn-ts/agent-kit` 发布 0.3.0，并做一个限制在工作目录里的文件助手：默认离线运行，设置环境变量就能连接真正的模型。

## 学完你能

- 写出 agent 的主循环：请求模型、执行工具、把结果交还给模型，直到模型给出最终回答
- 用脚本化的假模型给 agent 写确定性的测试：固定的回复、注入的失败、检查发给模型的请求
- 并行执行工具调用，限制并发，处理超时和取消，按调用的顺序交还结果
- 估算 token，按轮次省略旧的消息、截断过长的工具结果，同时不破坏"工具调用必须有结果"的规则
- 设计停止条件（完成、步数上限、输出被截断、重复调用、取消、出错），修复中断后的对话记录，只在一层重试
- 用可辨识联合设计流式事件，用泛型写出类型安全的事件分发
- 用洋葱模型设计中间件：改写请求、包装工具调用、拒绝执行、提前结束
- 给 agent 加上追踪：嵌套的 span、耗时和 token 用量、日志里的密钥脱敏
- 让模型安全地操作文件：路径穿越、前缀陷阱、符号链接、提示注入，默认只读、写入要确认

## 前置知识

- [第 1 章](../01-basics/README.md)：聊天记录的类型、可辨识联合
- [第 2 章](../02-advanced-types/README.md)：泛型、映射类型；工具注册表
- [第 3 章](../03-async/README.md)：Promise 组合、`AbortSignal`、异步迭代器、流式客户端
- [第 4 章](../04-tooling/README.md)：`@learn-ts/agent-kit` 的结构、`exports`、什么时候拆包
- [第 5 章](../05-validation/README.md)：`@learn-ts/agent-kit/zod` 的工具箱、不可信的输入

## 课程目录

| 节  | 内容                                                 | 示例                                                      | 练习                                                                                                                           |
| --- | ---------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 6.1 | [agent 主循环](01-agent-loop.md)                     | [01-agent-loop.ts](examples/01-agent-loop.ts)             | [01-agent-loop](../../exercises/06-harness/01-agent-loop.ts)                                                                   |
| 6.2 | [脚本化的假模型：确定性测试](02-scripted-model.md)   | [02-scripted-model.ts](examples/02-scripted-model.ts)     | [02-scripted-model](../../exercises/06-harness/02-scripted-model.ts)                                                           |
| 6.3 | [并行执行工具：超时与取消](03-parallel-tools.md)     | [03-parallel-tools.ts](examples/03-parallel-tools.ts)     | [03-parallel-tools](../../exercises/06-harness/03-parallel-tools.ts)                                                           |
| 6.4 | [上下文管理：token 预算与截断](04-context-window.md) | [04-context-window.ts](examples/04-context-window.ts)     | [04-context-window](../../exercises/06-harness/04-context-window.ts)                                                           |
| 6.5 | [停止条件与错误恢复](05-stop-and-recover.md)         | [05-stop-and-recover.ts](examples/05-stop-and-recover.ts) | [05-stop-and-recover](../../exercises/06-harness/05-stop-and-recover.ts)                                                       |
| 6.6 | [事件流：给界面的流式事件](06-event-stream.md)       | [06-event-stream.ts](examples/06-event-stream.ts)         | [06-event-stream](../../exercises/06-harness/06-event-stream.ts)                                                               |
| 6.7 | [钩子与中间件](07-middleware.md)                     | [07-middleware.ts](examples/07-middleware.ts)             | [07-middleware](../../exercises/06-harness/07-middleware.ts)                                                                   |
| 6.8 | [追踪与日志](08-tracing.md)                          | [08-tracing.ts](examples/08-tracing.ts)                   | [08-tracing](../../exercises/06-harness/08-tracing.ts)                                                                         |
| 6.9 | [章末项目：agent harness](09-project-harness.md)     | [project/demo.ts](project/demo.ts)                        | [project/agent](../../exercises/06-harness/project/agent.ts)、[project/sandbox](../../exercises/06-harness/project/sandbox.ts) |

6.1 和 6.2 是基础，必须先读：之后每一节的测试都用 6.2 的假模型。6.3 到 6.8 各自给主循环加上一种能力，相对独立，但章末项目会用到全部。

## 关于这一章的练习

- 每道练习都可以单独运行，例如 `pnpm ex 03-parallel-tools`；`pnpm ex 06-harness` 运行本章的全部练习
- 测试都是确定性的：不联网，不依赖真实的耗时（需要时间的地方用很短的延迟，或者用假模型控制节奏）
- 练习 6-6 还有类型测试（`*.test-d.ts`），检查事件分发的类型推导
- 章末项目的两道练习可以分开做：`project/sandbox` 只依赖第 5 章的工具箱，`project/agent` 用到 6-1 到 6-8 的全部零件

## 章末项目：agent harness

用前八节的零件组装出 `createAgent`：无状态（对话记录由调用方保管）、`run()` 立刻开始并返回事件流、`result` 永远不拒绝；带并行工具、超时、上下文预算、步数上限、重复检测、模型重试、中间件和追踪。再写一组只能在工作目录里活动的文件工具（列目录、读文件、搜索、写文件），挡住路径穿越、前缀陷阱和符号链接。演示程序是一个文件助手：默认用脚本化的假模型离线运行，设置 `OPENAI_API_KEY` 和 `OPENAI_MODEL` 就连接真正的模型。参考答案整合进 [packages/agent-kit](../../packages/agent-kit/)：harness 在主入口，假模型在 `@learn-ts/agent-kit/testing`，版本升到 0.3.0。

## 自测清单

1. 主循环什么时候结束？只调用工具、不说话的回复，`content` 应该是什么？
2. 为什么发给模型的应该是消息数组的副本？不这样做，会出现什么样的 bug？
3. 假的 HTTP 服务和脚本化的模型，各适合测哪一层？为什么假模型生成的工具调用 id 要在整个脚本里唯一？
4. 五个工具调用并行执行，结果应该按什么顺序交还给模型？界面上的事件又按什么顺序？
5. 一个工具超时了，harness 能让它停下来吗？为什么超时的调用要立刻让出并发名额？
6. 省略旧消息时，为什么要按轮次省略，而不是按条？只删掉一条工具结果会怎样？
7. 模型因为 `length` 停下，和因为步数上限停下，对调用方意味着什么不同？
8. 用户在工具执行到一半时取消，对话记录会处于什么状态？怎么修复它，让下一轮还能接着用？
9. 客户端已经有重试了，harness 还要不要重试？两层都重试会发生什么？
10. 事件类型为什么用可辨识联合？怎么写一个不需要类型断言的 `dispatchEvent`？
11. 中间件的 `next()` 被调用了两次会发生什么？为什么要拒绝？
12. 在日志里脱敏时，为什么不能简单地匹配含有 `token` 的键名？
13. 文件工具用 `target.startsWith(root)` 检查路径有什么漏洞？符号链接呢？为什么说模型给的路径是不可信的输入？

## 下一章

第 7 章：扩展。在这个 harness 上接入 MCP、让多个 agent 协作、跨对话的记忆，以及评测 agent 的表现。编写中，敬请期待。
