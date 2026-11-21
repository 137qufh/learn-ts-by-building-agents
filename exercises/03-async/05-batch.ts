/**
 * 练习 3-5：批量执行
 *
 * 课程：chapters/03-async/05-concurrency.md
 * 运行：pnpm ex 05-batch
 *
 * 这道题有运行时测试（05-batch.test.ts），也有类型测试（05-batch.test-d.ts）。
 */
import { todo, type Todo } from "../todo.ts";

/**
 * 对 items 中的每一项调用 fn，同时最多有 limit 个在执行。返回结果数组，顺序与 items 相同。
 *
 * - fn 的第二个参数是该项在 items 中的下标
 * - limit 必须是大于等于 1 的整数，否则抛出 RangeError（同步抛出或返回被拒绝的 Promise 都可以）
 * - 某个 fn 失败时，返回的 Promise 以这个错误拒绝，并且 **不再启动任何新的任务**
 *   （已经在执行的任务没法停下，随它们去）
 * - items 为空时返回空数组
 *
 * 提示：从课程里的 mapWithLimit 出发，加上"失败后停止领取"的逻辑。
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  return todo("实现 mapWithConcurrency");
}

/** 一个并发限制器：通过 run 提交的任务，同时最多执行 limit 个，其余的按提交顺序排队。 */
export interface Limiter {
  /** 提交一个任务。返回的 Promise 和任务本身的结果一致（成功或失败）。 */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** 正在执行的任务数。 */
  readonly active: number;
  /** 排队等待的任务数。 */
  readonly pending: number;
}

/**
 * 创建一个并发限制器（类似 npm 上的 p-limit）。和 mapWithConcurrency 不同，任务可以随时、
 * 从代码的任何地方提交。比如整个 agent 共用一个限制器，保证同时最多 3 个请求发往模型 API。
 *
 * - limit 不是大于等于 1 的整数时，抛出 RangeError
 * - 一个任务完成（无论成败）后，排在最前面的任务开始执行
 * - 任务同步抛出异常，等同于返回一个被拒绝的 Promise，同样要释放名额
 *
 * 提示：用一个数组作为等待队列，里面放"轮到你了"时要调用的函数。
 * 难点："名额交接时不会被新提交的任务抢走"这个测试。唤醒排队的任务之后，它要等到一个微任务里
 * 才真正恢复执行（3.1 节）。如果唤醒之前先把 active 减了 1，这个空档里新提交的任务就会抢走名额。
 */
export function createLimiter(limit: number): Limiter {
  return todo("实现 createLimiter");
}

/**
 * 把对象里每个值的类型换成 await 之后的类型：
 *   AwaitedObject<{ a: Promise<string>; b: number }> = { a: string; b: number }
 */
export type AwaitedObject<T> = Todo;

/**
 * Promise.all 的对象版本：同时等待对象里所有的 Promise，返回同样的键对应兑现的值。
 * 值也可以不是 Promise（原样返回）。任何一个拒绝，整体拒绝。
 *
 *   const { profile, models } = await allObject({ profile: fetchProfile(), models: fetchModels() });
 *
 * 比起 Promise.all([...]) 按位置解构，用名字取值更不容易搞错顺序。
 * 签名要你自己写：参数的类型参数是什么？返回类型怎么用上 AwaitedObject？
 */
export async function allObject(record: any): Promise<any> {
  return todo("实现 allObject");
}
