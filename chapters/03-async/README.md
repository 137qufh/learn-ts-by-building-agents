# 第 3 章：异步与流式

> 学会写"要等待"的代码：等网络、等模型、等用户，同时做好几件事，随时可以取消，出错了知道怎么办。

agent 的大部分时间都在等待：等模型生成回复，等工具调用完成，等用户输入。这一章从 JavaScript 怎么"同时"做很多事讲起（事件循环），然后是表示"将来的值"的 `Promise` 和让异步代码读起来像同步代码的 `async`/`await`。接着是真实世界里绕不开的几件事：错误处理、并发、取消与超时、重试。最后讲怎么处理"一连串陆续到达的值"：异步迭代器、Web 流和 SSE，也就是大模型流式输出背后的东西。

章末项目把这些全部组装起来：一个流式的大模型客户端，能一个字一个字地显示回复、拼好工具调用、自动重试、超时、取消，而且全部在没有网络、没有 API key 的情况下被测试覆盖。

## 学完你能

- 说出一段异步代码的执行顺序，解释同步代码、微任务、宏任务的区别
- 用 `async`/`await` 写出正确的异步代码，避开"忘了 `await`"、"先启动后等待"、`forEach` 里的 `await` 等常见的坑
- 区分"预料之中的失败"和"bug"，用自定义错误类、`cause` 和 `Result` 类型处理它们
- 根据需求选择 `Promise.all`、`allSettled`、`race`、`any`，并能限制并发数
- 用 `AbortController` 和 `AbortSignal` 让自己的函数支持取消和超时，并把信号一路传下去
- 写出带指数退避、随机抖动和 `Retry-After` 支持的重试，知道什么该重试、什么不该
- 用生成器和异步生成器处理数据流，理解拉取式、背压和提前退出时的清理
- 读取 `fetch` 的流式响应，正确处理被拆开的字符和行，解析 SSE
- 写出不依赖网络的确定性测试：把 `fetch`、时钟、随机数、`sleep` 作为参数传入

## 前置知识

- [第 1 章](../01-basics/README.md)：联合类型与收窄（1.6）、`unknown`（1.7）
- [第 2 章](../02-advanced-types/README.md)：泛型（2.1）；章末项目会用到第 2 章项目的 `ToolSchema` 和 `RawToolCall`

## 课程目录

| 节   | 内容                                                        | 示例                                                    | 练习                                                                 |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| 3.1  | [事件循环：JavaScript 怎么"同时"做很多事](01-event-loop.md) | [01-event-loop.ts](examples/01-event-loop.ts)           | [01-event-order](../../exercises/03-async/01-event-order.ts)         |
| 3.2  | [Promise](02-promises.md)                                   | [02-promises.ts](examples/02-promises.ts)               | [02-promises](../../exercises/03-async/02-promises.ts)               |
| 3.3  | [async/await](03-async-await.md)                            | [03-async-await.ts](examples/03-async-await.ts)         | [03-tool-runner](../../exercises/03-async/03-tool-runner.ts)         |
| 3.4  | [错误处理](04-error-handling.md)                            | [04-error-handling.ts](examples/04-error-handling.ts)   | [04-api-errors](../../exercises/03-async/04-api-errors.ts)           |
| 3.5  | [并发：Promise.all 和它的兄弟们](05-concurrency.md)         | [05-concurrency.ts](examples/05-concurrency.ts)         | [05-batch](../../exercises/03-async/05-batch.ts)                     |
| 3.6  | [取消与超时：AbortController](06-cancellation.md)           | [06-cancellation.ts](examples/06-cancellation.ts)       | [06-abort](../../exercises/03-async/06-abort.ts)                     |
| 3.7  | [重试与退避](07-retries.md)                                 | [07-retries.ts](examples/07-retries.ts)                 | [07-retry](../../exercises/03-async/07-retry.ts)                     |
| 3.8  | [异步迭代器与生成器](08-async-iterators.md)                 | [08-async-iterators.ts](examples/08-async-iterators.ts) | [08-stream-tools](../../exercises/03-async/08-stream-tools.ts)       |
| 3.9  | [流与 SSE：解析流式响应](09-streams-and-sse.md)             | [09-streams-and-sse.ts](examples/09-streams-and-sse.ts) | [09-sse-parser](../../exercises/03-async/09-sse-parser.ts)           |
| 3.10 | [章末项目：流式 LLM 客户端](10-project-streaming-client.md) | [project/demo.ts](project/demo.ts)                      | [project/llm-client](../../exercises/03-async/project/llm-client.ts) |

建议按顺序学习。3.1 到 3.3 是基础，后面每一节都会用到；3.4 到 3.7 可以看作一组"让异步代码在真实世界里可靠"的工具；3.8、3.9 为章末项目做准备。

## 关于异步练习

- 测试不需要网络，也不需要 API key。需要"网络"的地方用的是假的 `fetch` 或者本机（`127.0.0.1`）上临时启动的服务器
- 有些测试会真的等待很短的时间（几毫秒到几十毫秒）。这是故意的：取消、超时这类行为，用真实的定时器测更可信。整章的测试几秒内就能跑完
- 还有一些函数接收 `sleep`、`random`、`now` 之类的参数，测试里传入假的版本，让结果完全确定。这种"把依赖作为参数传入"的写法是本章的一个重点，3.7 节专门讲了为什么
- 练习 7 会导入你在练习 6 写的 `abortableSleep`，章末项目会导入练习 4、6、7、8、9 的函数。所以请按顺序做
- 练习 1 是"预测输出顺序"，答案写在数组里，测试会告诉你对不对，但不会直接告诉你正确答案

每道练习都可以单独运行，例如 `pnpm ex 06-abort`；`pnpm ex 03-async` 会运行本章的全部练习。

## 章末项目：流式 LLM 客户端

实现一个 OpenAI 兼容接口（OpenAI、DeepSeek、通义千问、Kimi、Ollama 等都支持）的流式客户端：`stream()` 一个字一个字地交出回复，把分段到达的工具调用拼好，在 5xx、429 和网络错误时退避重试（遵守 `Retry-After`），等待响应和读取流都有超时，随时可以取消，无论怎样结束都不泄漏连接和定时器。工具定义直接使用第 2 章注册表的 `schemas()`，返回的工具调用可以直接交给 `dispatch`。演示默认连接一个假服务器；设置几个环境变量，就能连接真正的模型。第 6 章的 agent 主循环会用它和模型对话。

## 自测清单

1. `setTimeout(fn, 0)`、`Promise.resolve().then(fn)`、`queueMicrotask(fn)` 和普通的同步代码，谁先执行？为什么一个死循环的 `.then` 链会让定时器永远不触发？
2. `Promise<T>` 为什么没有"错误的类型"这个类型参数？`.catch` 和 `catch (error)` 里的错误是什么类型？
3. `async` 函数里 `return promise` 和 `return await promise` 在 `try` 块中有什么区别？
4. 下面的代码有什么问题？`const a = fetchA(); const b = await fetchB(); const c = await a;`
5. 什么时候应该抛出异常，什么时候应该返回 `Result`？为什么 `cause` 比把原始错误的消息拼进新消息更好？
6. `Promise.all`、`allSettled`、`race`、`any` 分别在什么情况下兑现和拒绝？`Promise.all` 里一个失败了，其他的会停下来吗？
7. 一个支持取消的函数应该做到哪几件事？为什么"已经取消的 signal"要单独处理？`AbortSignal.timeout` 和 `AbortSignal.any` 各解决什么问题？
8. 什么样的请求可以安全地重试？为什么要加随机抖动？为什么流开始之后不应该自动重试？
9. 消费者从 `for await` 中 `break` 时，异步生成器会发生什么？它的 `finally` 会执行吗？
10. 为什么逐块调用 `new TextDecoder().decode(chunk)` 是错的？SSE 里的空行是什么意思？

## 下一章

第 4 章：工程化（模块、包、测试、lint、构建与发布），把这一章的客户端整理成一个可以发布的 npm 包。编写中，敬请期待。
