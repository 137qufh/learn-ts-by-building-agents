/**
 * 练习 2-5：工具包装器
 *
 * 课程：chapters/02-advanced-types/05-infer.md
 * 运行：pnpm ex 05-tool-wrappers
 *
 * agent 框架很少直接调用工具函数，而是先给它"包一层"：记录每次调用（方便调试和回放）、
 * 出错时返回兜底值、缓存重复的调用……包装之后，函数的参数和返回类型必须原样保留，
 * 否则调用方就失去了类型检查。
 *
 * 前半部分是纯类型练习（用 infer），后半部分是包装函数（用泛型参数）。
 * 需要你写签名的函数先用 any 占位；类型测试在 05-tool-wrappers.test-d.ts。
 * 不允许在你的答案里使用 any。
 */
import { todo, type Todo } from "../todo.ts";

/** 数组（包括只读数组）的元素类型；T 不是数组时为 never。 */
export type ElementOf<T> = Todo;

/** 函数第一个参数的类型；函数没有参数或 F 不是函数时为 never。 */
export type FirstArg<F> = Todo;

/** 元组的最后一个元素；空元组为 never。 */
export type Last<T extends readonly unknown[]> = Todo;

/** 一层层拆开 Promise：`Unwrap<Promise<Promise<number>>>` 是 number；不是 Promise 时原样返回。 */
export type Unwrap<T> = Todo;

/**
 * 处理函数表 → 每个工具的返回值类型表。异步函数取 Promise 里面的类型。
 * `ResultsOf<{ a: () => number; b: () => Promise<string> }>` 是 `{ a: number; b: string }`。
 * 提示：可以用上面的 Unwrap。
 */
export type ResultsOf<H> = Todo;

/** 一次调用的记录：成功时有 result，失败时有 error。 */
export type CallRecord<A extends unknown[], R> =
  { args: A; ok: true; result: R } | { args: A; ok: false; error: unknown };

/**
 * 包装 fn，返回 { fn, calls }：
 * - fn：和原函数签名完全相同的新函数，调用时转发给原函数
 * - calls：每次调用的记录，按调用顺序排列
 *
 * 原函数抛出异常时，记录下这次失败，然后把异常 **原样重新抛出**。
 */
export function recorded(fn: (...args: any[]) => any): { fn: any; calls: any[] } {
  return todo("实现 recorded");
}

/**
 * 包装 fn：原函数抛出异常时返回 fallback，而不是抛出。
 * fallback 的类型必须能赋值给 fn 的返回类型。
 */
export function withFallback(fn: (...args: any[]) => any, fallback: any): any {
  return todo("实现 withFallback");
}

/**
 * 缓存只有一个参数的函数：同一个参数（用 Map 的键比较规则）只真正调用一次，之后直接返回缓存的结果。
 * 抛出异常的调用不缓存。
 */
export function memoize(fn: (arg: any) => any): any {
  return todo("实现 memoize");
}
