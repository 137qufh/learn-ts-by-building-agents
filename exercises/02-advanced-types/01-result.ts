/**
 * 练习 2-1：Result 类型
 *
 * 课程：chapters/02-advanced-types/01-generics.md
 * 运行：pnpm ex 01-result
 *
 * agent 调用工具时，失败是家常便饭：网络超时、参数不对、文件不存在……
 * 如果每个工具都靠抛异常报错，调用方很容易忘记 try/catch，一个工具出错就让整个 agent 崩掉。
 * 另一种做法是把"成功或失败"放进返回值：`Result<T, E>`。类型系统会逼着调用方先检查 ok，
 * 才能拿到 value。
 *
 * 这道题有两部分测试：
 * - 01-result.test.ts：运行时行为
 * - 01-result.test-d.ts：类型。题目里的函数先用 any 占位，所以运行时测试能编译通过，
 *   但类型测试会失败。你的任务是把 any 换成合适的泛型。
 *
 * 不允许在你的答案里使用 any。
 */
import { todo, type Todo } from "../todo.ts";

/**
 * 成功时是 `{ ok: true; value: T }`，失败时是 `{ ok: false; error: E }`。
 * E 默认是 Error，也就是说 `Result<number>` 等于 `Result<number, Error>`。
 */
export type Result<T, E> = Todo;

/** 构造一个成功的结果。`ok(1)` 的类型应该是 `Result<number, never>`。 */
export function ok(value: any): any {
  return todo("实现 ok");
}

/** 构造一个失败的结果。`err("timeout")` 的类型应该是 `Result<never, string>`。 */
export function err(error: any): any {
  return todo("实现 err");
}

/**
 * 如果成功，用 fn 转换其中的值；如果失败，原样返回失败。
 * 返回值的类型应该同时反映"新的值类型"和"原来的错误类型"。
 */
export function mapResult(result: any, fn: (value: any) => any): any {
  return todo("实现 mapResult");
}

/**
 * 成功时返回其中的值，失败时返回 fallback。
 * fallback 的类型必须和成功值的类型一致：`unwrapOr(ok(1), "x")` 应该报类型错误。
 *
 * 提示：想一想 2.1 节的 NoInfer。
 */
export function unwrapOr(result: any, fallback: any): any {
  return todo("实现 unwrapOr");
}

/**
 * 执行 fn，把它的返回值包装成成功；如果 fn 抛出异常，把异常包装成失败。
 * 因为 JavaScript 可以 throw 任何东西，错误类型是 unknown（见 1.7 节）。
 */
export function attempt(fn: () => any): any {
  return todo("实现 attempt");
}

/**
 * 把一组 Result 合并成一个：全部成功时，返回所有值组成的数组（顺序不变）；
 * 只要有一个失败，就返回 **第一个** 失败。
 *
 * 例如 agent 一次请求了好几个工具调用，只有全部成功时才继续。
 */
export function collectResults(results: readonly any[]): any {
  return todo("实现 collectResults");
}
