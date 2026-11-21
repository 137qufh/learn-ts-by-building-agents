/**
 * 练习 3-3：执行工具调用
 *
 * 课程：chapters/03-async/03-async-await.md
 * 运行：pnpm ex 03-tool-runner
 *
 * 模型一次回复里可能请求调用好几个工具。harness 要执行它们，把每个结果交还给模型。
 * 这道题用 async/await 实现几种执行方式。从这道题开始，可以自由使用 async/await 了。
 */
import { todo } from "../todo.ts";

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

/** 执行一个工具调用，返回工具的输出文本。可能失败（拒绝）。 */
export type Executor = (call: ToolCall) => Promise<string>;

/** 一个工具调用的结果。失败不会抛出，而是记录下来：模型需要知道哪个工具失败了、为什么。 */
export type ToolResult =
  { id: string; ok: true; output: string } | { id: string; ok: false; error: string };

/**
 * 一个接一个地执行：前一个完成（无论成功失败）之后才开始下一个。
 * 返回每个调用的结果，顺序与 calls 相同。某个工具失败不影响后面的工具，整个函数永远不会拒绝。
 *
 * 失败时 error 字段是：异常是 Error 就用它的 message，否则用 String(异常)。
 *
 * 什么时候需要顺序执行？比如工具之间有依赖（先创建文件再写入），或者它们会修改同一份状态。
 */
export async function runSequentially(
  calls: readonly ToolCall[],
  execute: Executor,
): Promise<ToolResult[]> {
  return todo("实现 runSequentially");
}

/**
 * 同时开始执行所有调用，全部完成后返回结果。结果的格式和顺序要求与 runSequentially 相同，同样永远不会拒绝。
 *
 * 提示：先写一个把单个调用变成"永远不会拒绝的 Promise<ToolResult>"的函数，两种执行方式都能用上。
 */
export async function runConcurrently(
  calls: readonly ToolCall[],
  execute: Executor,
): Promise<ToolResult[]> {
  return todo("实现 runConcurrently");
}

/**
 * 按顺序尝试 attempts 里的每个函数，返回第一个成功的结果，后面的函数不再调用。
 * 全部失败时，抛出 AggregateError：errors 是每次失败的原因（按尝试的顺序），message 是 "全部失败"。
 * attempts 为空时同样抛出 AggregateError（errors 为空数组）。
 *
 * 比如：依次尝试几个模型供应商，直到有一个可用。
 * AggregateError 是 JavaScript 内置的错误类型：new AggregateError(errors, message)。
 */
export async function firstSuccessful<T>(attempts: readonly (() => Promise<T>)[]): Promise<T> {
  return todo("实现 firstSuccessful");
}

/**
 * 执行 fn，返回它的结果和耗时（毫秒）。fn 失败时，原样抛出它的错误。
 *
 * now 是获取当前时间的函数，默认用 performance.now。测试会传入一个假的时钟，
 * 这样就能精确地检查耗时，而不用真的等待。这种"把依赖作为参数传入"的写法叫依赖注入，
 * 它让依赖时间、网络、随机数的代码变得容易测试，本章会反复用到。
 */
export async function timed<T>(
  fn: () => Promise<T>,
  now: () => number = () => performance.now(),
): Promise<{ value: T; ms: number }> {
  return todo("实现 timed");
}
