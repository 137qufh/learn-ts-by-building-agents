/**
 * 练习 3-8：处理异步流的工具
 *
 * 课程：chapters/03-async/08-async-iterators.md
 * 运行：pnpm ex 08-stream-tools
 *
 * 前四个函数用 async function* 和 for await 实现，每个只需要几行。
 * 最后的 idleTimeout 难一些，需要手动操作迭代器。
 */
import { todo } from "../todo.ts";

/** 把一个异步可迭代对象的所有值收集到数组里。 */
export async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  return todo("实现 collect");
}

/**
 * 只取前 count 个值。取够之后立刻结束，并且让上游也结束（它的 finally 要执行）。
 * count 小于等于 0 时什么也不产生，并且根本不从上游读取。
 */
export async function* take<T>(source: AsyncIterable<T>, count: number): AsyncGenerator<T> {
  yield todo("实现 take");
}

/**
 * 对每个值调用 fn，产出结果。fn 的第二个参数是下标（从 0 开始）。
 * fn 可以返回 Promise，此时产出 await 之后的值。
 */
export async function* mapAsync<T, R>(
  source: AsyncIterable<T>,
  fn: (item: T, index: number) => R | Promise<R>,
): AsyncGenerator<R> {
  yield todo("实现 mapAsync");
}

/**
 * 每 size 个值打包成一个数组产出，最后不足 size 个的也要产出（如果有的话）。
 * size 不是大于等于 1 的整数时抛出 RangeError（在第一次迭代时抛出即可）。
 *
 * 用途：模型一个字一个字地输出，但更新界面没必要那么频繁，攒几个再刷新一次。
 */
export async function* batch<T>(source: AsyncIterable<T>, size: number): AsyncGenerator<T[]> {
  yield todo("实现 batch");
}

/**
 * 原样产出 source 的值；但如果 **等待下一个值** 的时间超过 ms 毫秒，抛出一个
 * name 为 "TimeoutError" 的 DOMException，message 是 `超过 ${ms}ms 没有收到新数据`。
 *
 * 用途：模型的流式响应有时会卡住，连接没断，数据却不来了。总超时不好设（长回答本来就要很久），
 * 更合理的是限制"两块数据之间"的间隔。
 *
 * 要求：
 * - 只计算等待上游的时间。消费者在循环体里花的时间不算
 * - 超时后，让上游结束：调用迭代器的 return()。注意 **不要 await 它**：上游正卡在某个 await 上，
 *   return() 要等它走到下一个 yield 才会完成，await 它会让你也一起卡住
 * - 消费者提前退出（break）时，同样让上游结束
 * - 每次等待结束都要清除定时器
 *
 * 提示：用 source[Symbol.asyncIterator]() 拿到迭代器，自己调用 next()，
 * 用 Promise.race 让它和一个定时器赛跑。
 */
export async function* idleTimeout<T>(source: AsyncIterable<T>, ms: number): AsyncGenerator<T> {
  yield todo("实现 idleTimeout");
}
