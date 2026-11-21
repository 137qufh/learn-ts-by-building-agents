/**
 * 练习 2-5 参考答案：工具包装器
 */

export type ElementOf<T> = T extends readonly (infer E)[] ? E : never;

// 模式 [infer A, ...unknown[]] 要求至少有一个参数，所以 () => void 匹配失败，得到 never。
// 写成 (first: infer A, ...rest: never[]) => unknown 是行不通的：无参函数也能赋值给它（A 会被推断为 unknown）。
export type FirstArg<F> = F extends (...args: infer P) => unknown
  ? P extends [infer A, ...unknown[]]
    ? A
    : never
  : never;

export type Last<T extends readonly unknown[]> = T extends readonly [...unknown[], infer L]
  ? L
  : never;

export type Unwrap<T> = T extends Promise<infer V> ? Unwrap<V> : T;

export type ResultsOf<H> = {
  [K in keyof H]: H[K] extends (...args: never[]) => infer R ? Unwrap<R> : never;
};

export type CallRecord<A extends unknown[], R> =
  { args: A; ok: true; result: R } | { args: A; ok: false; error: unknown };

export function recorded<A extends unknown[], R>(
  fn: (...args: A) => R,
): { fn: (...args: A) => R; calls: CallRecord<A, R>[] } {
  const calls: CallRecord<A, R>[] = [];
  return {
    fn: (...args) => {
      try {
        const result = fn(...args);
        calls.push({ args, ok: true, result });
        return result;
      } catch (error) {
        calls.push({ args, ok: false, error });
        throw error;
      }
    },
    calls,
  };
}

// NoInfer：R 只从 fn 推断，fallback 只负责被检查（同 2-1 的 unwrapOr）。
export function withFallback<A extends unknown[], R>(
  fn: (...args: A) => R,
  fallback: NoInfer<R>,
): (...args: A) => R {
  return (...args) => {
    try {
      return fn(...args);
    } catch {
      return fallback;
    }
  };
}

export function memoize<T, R>(fn: (arg: T) => R): (arg: T) => R {
  const cache = new Map<T, R>();
  return (arg) => {
    // 用 has 而不是 get 判断：缓存的结果可能是 undefined 或其他假值
    if (cache.has(arg)) {
      return cache.get(arg) as R; // has 为 true 时 get 一定有值，但 TS 不知道这两次调用之间的关系
    }
    const result = fn(arg); // 抛出异常时直接跳出，不会写入缓存
    cache.set(arg, result);
    return result;
  };
}
