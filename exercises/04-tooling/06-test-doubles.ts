/**
 * 练习 4-6：自己动手写测试替身
 *
 * 课程：chapters/04-tooling/06-testing.md
 * 运行：pnpm ex 06-test-doubles
 *
 * vi.fn() 和 vi.useFakeTimers() 很好用，但它们并不神秘。自己写一遍简化版，
 * 就知道它们在做什么、为什么注入依赖的代码这么好测。
 */
import { todo } from "../todo.ts";

// ── 第一部分：间谍函数 ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 约束"任意函数"的标准写法，参数位置必须用 any
export type AnyFunction = (...args: any[]) => any;

/** 一次调用的结果：正常返回了什么，或者抛出了什么 */
export type SpyResult<R> = { type: "return"; value: R } | { type: "throw"; error: unknown };

/**
 * 间谍函数：可以像 F 一样调用，同时记录每一次调用。
 */
export interface Spy<F extends AnyFunction> {
  (...args: Parameters<F>): ReturnType<F>;
  /** 每次调用的参数，按调用顺序 */
  readonly calls: Parameters<F>[];
  /** 每次调用的结果，和 calls 一一对应 */
  readonly results: SpyResult<ReturnType<F>>[];
  /** 换掉实现，之后的调用都用新的实现 */
  implement(impl: F): void;
  /** 只有下一次调用使用 impl，之后恢复。可以连续调用多次，按顺序各用一次 */
  implementOnce(impl: F): void;
  /** 清空 calls 和 results（实现不变） */
  reset(): void;
}

/**
 * 创建一个间谍函数，调用时执行 impl，并记录参数和结果。
 * - impl 正常返回：results 里记 { type: "return", value }，并返回 value
 * - impl 抛错：results 里记 { type: "throw", error }，然后把错误原样抛出
 * - impl 返回 Promise 时，记录的就是这个 Promise 本身（和 vi.fn 一样）
 *
 * 提示：函数也是对象，可以用 Object.assign(fn, { calls, results, ... }) 给它加上属性。
 * - calls 和 results 必须是同一个数组对象（reset 时清空，而不是换一个新数组），
 *   这样提前拿到 spy.calls 的代码也能看到后来的调用
 */
export function createSpy<F extends AnyFunction>(impl: F): Spy<F> {
  return todo("实现 createSpy");
}

// ── 第二部分：假时钟 ──────────────────────────────────────────────────

export interface FakeClock {
  /** 当前时间（毫秒） */
  now(): number;
  /** 返回一个 Promise，在时钟被拨到 now() + ms（或更晚）时完成 */
  sleep(ms: number): Promise<void>;
  /** 把时钟往前拨 ms 毫秒，期间到期的 sleep 按顺序完成 */
  advance(ms: number): Promise<void>;
  /** 还没完成的 sleep 有几个 */
  pending(): number;
}

/** 让已经排队的微任务（包括它们引发的新微任务）都执行完 */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * 创建一个假时钟，初始时间是 start。
 *
 * - sleep(ms)：ms <= 0 时返回一个已经完成的 Promise；否则登记一个在 now() + ms 到期的计时器
 * - advance(ms)：目标时间是 now() + ms。反复执行：
 *   1. 先等已经排队的微任务执行完（用上面的 flush）。被唤醒的代码、或者调用 advance 之前刚启动的
 *      异步代码，可能要经过几个 await 才会调用 sleep，不等它们，就会漏掉它们登记的计时器
 *   2. 找出最早到期、且到期时间不晚于目标的计时器（到期时间相同的，先登记的先完成）
 *   3. 没有找到：把 now() 设为目标时间，结束；找到了：把 now() 设为它的到期时间，完成它，回到第 1 步
 * - advance 的参数是负数时抛出 RangeError（时间不能倒流）
 */
export function createFakeClock(start = 0): FakeClock {
  return todo("实现 createFakeClock");
}
