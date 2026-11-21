/**
 * 练习 3-6：取消与超时
 *
 * 课程：chapters/03-async/06-cancellation.md
 * 运行：pnpm ex 06-abort
 *
 * 这些函数会在章末项目里用到：重试之间的等待要能被取消，每次请求要有超时。
 */
import { todo } from "../todo.ts";

/**
 * 等待 ms 毫秒。signal 被取消时，立刻以 signal.reason 拒绝。
 *
 * - 调用时 signal 已经被取消：立刻拒绝，不启动定时器
 * - 被取消时：清除定时器
 * - 正常结束时：移除你在 signal 上添加的 "abort" 监听（测试会检查）
 */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return todo("实现 abortableSleep");
}

/**
 * 让一个 Promise 可以被"放弃"：promise 先完成，就用它的结果（成功或失败）；
 * signal 先被取消，就立刻以 signal.reason 拒绝。
 *
 * - 调用时 signal 已经被取消：立刻拒绝
 * - promise 先完成时，移除 "abort" 监听
 * - 不传 signal 时，结果和 promise 完全一样
 *
 * 注意它只是不再等待，promise 背后的操作并不会因此停下。对于不支持 signal 的第三方函数，
 * 这是能做到的最好的程度。
 */
export function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  return todo("实现 raceAbort");
}

/**
 * 带超时地执行 task。
 *
 * task 会收到一个 signal，它在以下任一情况下被取消：
 * - 超过 ms 毫秒（reason 是 AbortSignal.timeout 产生的 TimeoutError）
 * - options.signal 被取消（reason 是 options.signal.reason）
 *
 * 返回 task 的结果。signal 被取消时，即使 task 没有理会 signal（迟迟不完成），
 * 返回的 Promise 也要立刻以 signal 的 reason 拒绝。
 *
 * 提示：AbortSignal.timeout、AbortSignal.any，再加上你刚写的 raceAbort。
 */
export function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  ms: number,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  return todo("实现 withTimeout");
}

/** 是不是"被取消"的错误：一个 Error（DOMException 也是 Error），并且 name 是 "AbortError"。 */
export function isAbortError(error: unknown): boolean {
  return todo("实现 isAbortError");
}

/** 是不是"超时"的错误：一个 Error，并且 name 是 "TimeoutError"。 */
export function isTimeoutError(error: unknown): boolean {
  return todo("实现 isTimeoutError");
}
