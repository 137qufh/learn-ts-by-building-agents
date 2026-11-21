/**
 * 练习 3-2 参考答案：自己动手创建 Promise
 */

export function sleep(ms: number): Promise<void> {
  // setTimeout 会用零个参数调用 resolve，正好对应 Promise<void>
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type NodeCallback<T> = (error: Error | null, value?: T) => void;

export function fromCallback<T>(start: (callback: NodeCallback<T>) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // executor 里同步抛出的异常会自动变成 rejection，所以 start 抛错时不需要自己 try/catch
    start((error, value) => {
      if (error !== null) {
        reject(error);
      } else if (value === undefined) {
        reject(new Error("回调没有返回结果"));
      } else {
        resolve(value);
      }
      // 回调被调用多次时，后面的 resolve / reject 会被 Promise 自动忽略
    });
  });
}

export function promisify<A extends unknown[], T>(
  fn: (...args: [...A, NodeCallback<T>]) => void,
): (...args: A) => Promise<T> {
  return (...args) => fromCallback<T>((callback) => fn(...args, callback));
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  readonly state: "pending" | "fulfilled" | "rejected";
}

export function createDeferred<T>(): Deferred<T> {
  let state: Deferred<T>["state"] = "pending";
  // 先给一个占位的值：TS 看不出 executor 会同步执行，直接 `let resolveFn;` 会被认为"使用前未赋值"
  let resolveFn: (value: T) => void = () => {};
  let rejectFn: (reason: unknown) => void = () => {};

  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  return {
    promise,
    resolve(value) {
      if (state === "pending") {
        state = "fulfilled";
        resolveFn(value);
      }
    },
    reject(reason) {
      if (state === "pending") {
        state = "rejected";
        rejectFn(reason);
      }
    },
    get state() {
      return state;
    },
  };
}

export function orElse<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  // 返回 fallback() 的 Promise：它的结果（成功或失败）就是整条链的结果
  return primary().catch(() => fallback());
}
