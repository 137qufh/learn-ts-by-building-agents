/**
 * 练习 3-7：重试
 *
 * 课程：chapters/03-async/07-retries.md
 * 运行：pnpm ex 07-retry
 *
 * 这道题会用到你在练习 3-6 里写的 abortableSleep，请先完成它。
 */
import { todo } from "../todo.ts";
import { abortableSleep } from "./06-abort.ts";

/**
 * 解析 HTTP 响应头 Retry-After，返回需要等待的毫秒数。
 *
 * - null 或者去掉首尾空白后为空：undefined
 * - 秒数（非负的整数或小数，比如 "2"、"1.5"）：乘以 1000，四舍五入成整数毫秒
 * - HTTP 日期（以 "GMT" 结尾，比如 "Thu, 01 Jan 2026 00:00:05 GMT"）：距离 now 的毫秒数，
 *   日期已经过去时返回 0；Date.parse 解析不了时返回 undefined
 * - 其他一切（负数、"soon"……）：undefined
 *
 * 为什么日期要求以 "GMT" 结尾？Date.parse 非常宽松，会把 "-1"、"1.5" 这样的字符串也当成日期，
 * 而 HTTP 规范规定这个日期必须以 GMT 结尾。先用规则把格式限定住，再交给 Date.parse。
 */
export function parseRetryAfter(
  value: string | null,
  now: number = Date.now(),
): number | undefined {
  return todo("实现 parseRetryAfter");
}

/** 第 attempt 次重试前的退避时间（已给出，与练习 1-3 相同）：baseMs × 2^(attempt-1)，不超过 maxMs。 */
export function backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  return Math.min(baseMs * 2 ** (attempt - 1), maxMs);
}

/** 全抖动：返回 [0, ms] 范围内的随机整数，即 Math.round(ms × random())。 */
export function fullJitter(ms: number, random: () => number = Math.random): number {
  return todo("实现 fullJitter");
}

export interface RetryInfo {
  /** 刚刚失败的是第几次尝试（从 1 开始）。 */
  attempt: number;
  /** 下一次尝试前要等待的毫秒数。 */
  delayMs: number;
  /** 这次失败的原因。 */
  error: unknown;
}

export interface RetryOptions {
  /** 最多重试几次（不含第一次尝试），默认 3。 */
  retries?: number;
  /** 退避的初始值，默认 500。 */
  baseMs?: number;
  /** 退避的上限，默认 30_000。 */
  maxMs?: number;
  /** 这个错误值得重试吗？attempt 是刚刚失败的是第几次尝试。默认总是重试。 */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** 从错误中读出服务器要求的等待时间（比如 ApiError 上记录的 Retry-After）。默认总是 undefined。 */
  retryAfterMs?: (error: unknown) => number | undefined;
  /** 给退避时间加抖动，默认 fullJitter。 */
  jitter?: (ms: number) => number;
  /** 等待的函数，默认 abortableSleep。测试会传入一个不真正等待的假函数。 */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** 取消整个重试过程。 */
  signal?: AbortSignal;
  /** 每次决定重试、开始等待之前调用。 */
  onRetry?: (info: RetryInfo) => void;
}

/**
 * 调用 fn，失败时按规则重试。fn 收到当前是第几次尝试（从 1 开始）和 options.signal。
 *
 * 规则（按顺序检查）：
 * 1. 每次尝试之前，signal 已经被取消：以 signal.reason 拒绝，不再调用 fn
 * 2. fn 成功：返回它的结果
 * 3. fn 失败后，signal 已经被取消：以 signal.reason 拒绝（取消优先于一切，不再重试）
 * 4. 重试次数已经用完，或者 shouldRetry 返回 false：抛出这次的错误（原样）
 * 5. 计算等待时间：
 *    - retryAfterMs(error) 返回了数字：用它（服务器说了算，不加抖动）。但如果它超过了 maxMs，
 *      直接放弃，抛出这次的错误：等那么久没有意义，不如让调用方决定
 *    - 否则：jitter(backoffDelay(attempt, baseMs, maxMs))
 * 6. 调用 onRetry，然后 await sleep(等待时间, signal)，再进行下一次尝试。
 *    等待期间被取消时，sleep 会以 signal.reason 拒绝，这个拒绝直接传给调用方
 */
export async function retry<T>(
  fn: (attempt: number, signal?: AbortSignal) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  return todo("实现 retry");
}

// 只是为了让未使用的导入不报错，实现 retry 时可以删掉这一行
void abortableSleep;
