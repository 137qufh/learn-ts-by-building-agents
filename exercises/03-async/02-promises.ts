/**
 * 练习 3-2：自己动手创建 Promise
 *
 * 课程：chapters/03-async/02-promises.md
 * 运行：pnpm ex 02-promises
 *
 * 这一节的练习都用 new Promise、then、catch 完成。async/await 是下一节的内容，
 * 这里先不要用：只有亲手写过 Promise，才会真正明白 async/await 帮你省掉了什么。
 */
import { todo } from "../todo.ts";

/**
 * 返回一个在 ms 毫秒后兑现的 Promise。
 *
 * 提示：用 setTimeout。
 */
export function sleep(ms: number): Promise<void> {
  return todo("实现 sleep");
}

/** Node.js 风格的回调：第一个参数是错误（没有错误时是 null），第二个参数是结果。 */
export type NodeCallback<T> = (error: Error | null, value?: T) => void;

/**
 * 把一个回调风格的操作包装成 Promise。
 *
 * start 是"启动操作"的函数，你要传给它一个 NodeCallback：
 * - 回调收到非 null 的 error：以这个 error 拒绝
 * - error 是 null：以 value 兑现。但如果 value 是 undefined，以 Error("回调没有返回结果") 拒绝
 * - start 本身同步抛出异常：以这个异常拒绝
 *
 *   const text = await fromCallback<string>((cb) => fs.readFile("a.txt", "utf8", cb));
 */
export function fromCallback<T>(start: (callback: NodeCallback<T>) => void): Promise<T> {
  return todo("实现 fromCallback");
}

/**
 * 把"最后一个参数是回调"的函数转换成返回 Promise 的函数（和 Node.js 的 util.promisify 一样）。
 *
 *   function legacyAdd(a: number, b: number, cb: NodeCallback<number>) { ... }
 *   const add = promisify(legacyAdd); // (a: number, b: number) => Promise<number>
 *
 * 签名已经写好了：A 接住除回调以外的参数（一个元组），T 是回调的结果类型，这是 2.5 节
 * "不写 infer 也能推断"的又一个例子。实现时用上面的 fromCallback。
 */
export function promisify<A extends unknown[], T>(
  fn: (...args: [...A, NodeCallback<T>]) => void,
): (...args: A) => Promise<T> {
  return todo("实现 promisify");
}

/** 一个可以从外部完成的 Promise。 */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  /** 当前状态。第一次调用 resolve 或 reject 之后就不再变化。 */
  readonly state: "pending" | "fulfilled" | "rejected";
}

/**
 * 实现你自己的 Promise.withResolvers，并且多记录一个 state。
 * 不允许使用 Promise.withResolvers。
 *
 * 提示：executor 是同步执行的，所以在 new Promise(...) 这一行结束时，你已经拿到了 resolve 和 reject。
 * state 可以用一个 getter 实现：{ get state() { return ...; } }
 */
export function createDeferred<T>(): Deferred<T> {
  return todo("实现 createDeferred");
}

/**
 * 先尝试 primary；如果它失败了，再尝试 fallback。
 * - primary 成功：用它的结果，fallback 不会被调用
 * - primary 失败、fallback 成功：用 fallback 的结果
 * - 两个都失败：以 fallback 的错误拒绝
 *
 * 比如：先调用主力模型，失败了再调用备用模型。用 then / catch 实现。
 */
export function orElse<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  return todo("实现 orElse");
}
