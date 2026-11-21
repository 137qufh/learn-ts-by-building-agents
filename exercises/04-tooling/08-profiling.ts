/**
 * 练习 4-8：给 agent 加上计时
 *
 * 课程：chapters/04-tooling/08-debugging-and-profiling.md
 * 运行：pnpm ex 08-profiling
 *
 * "感觉很慢"不是可以行动的信息。harness 需要知道：一轮对话里，模型调用花了多久、
 * 每个工具花了多久、最慢的那 5% 有多慢。这道题写一个最小的计时器（tracer）。
 */
import { todo } from "../todo.ts";

/**
 * 百分位数，用"最近秩"（nearest-rank）的方法：
 * 把 values 从小到大排序，取第 ceil(p / 100 × n) 个（从 1 开始数）；p 为 0 时取最小值。
 *
 * - values 为空：抛出 RangeError
 * - p 不在 0 到 100 之间：抛出 RangeError
 * - 不能修改传入的数组
 *
 * 例子：[15, 20, 35, 40, 50] 的 p50 是第 ceil(2.5) = 3 个，即 35；p95 是第 5 个，即 50。
 */
export function percentile(values: readonly number[], p: number): number {
  return todo("实现 percentile");
}

export interface Span {
  name: string;
  /** 开始时间（now() 的返回值） */
  start: number;
  /** 持续时间，毫秒 */
  ms: number;
  /** fn 是否抛错了 */
  ok: boolean;
}

export interface SpanSummary {
  name: string;
  count: number;
  totalMs: number;
  p50: number;
  p95: number;
  maxMs: number;
}

export interface Tracer {
  /**
   * 执行 fn 并计时，返回 fn 的结果。fn 可以是同步的，也可以返回 Promise（计时到 Promise 完成为止）。
   * fn 抛错（或 Promise 被拒绝）时，同样记录这个 span（ok 为 false），然后把错误原样抛出。
   */
  span<T>(name: string, fn: () => T | Promise<T>): Promise<T>;
  /** 所有已经结束的 span，按结束的先后顺序 */
  spans(): Span[];
  /**
   * 按名字汇总：每个名字一项，按 totalMs 从大到小排序，totalMs 相同时按名字排序。
   * p50、p95 用 percentile 计算。
   */
  summary(): SpanSummary[];
}

/** 创建一个计时器。now 默认用 performance.now()（单调递增的高精度时钟，见课程） */
export function createTracer(now: () => number = () => performance.now()): Tracer {
  return todo("实现 createTracer");
}
