/**
 * 练习 2-1 参考答案：Result 类型
 */

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

// 返回 Result<T, never>：never 表示"不可能失败"。never 可以赋值给任何类型，
// 所以 ok(1) 能直接赋值给 Result<number, string>、Result<number, Error> 等任何错误类型。
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// 三个类型参数：T 是原来的值，U 是新的值，E 是错误（原样传递）。
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  // 失败分支可以直接返回原对象：收窄后它的类型是 { ok: false; error: E }，
  // 它同时也是 Result<U, E> 的一个成员，不需要重新构造。
  return result.ok ? ok(fn(result.value)) : result;
}

// 没有 NoInfer 时，T 会同时从 result 和 fallback 推断：unwrapOr(ok(1), "x") 推断出
// T = number | string，不会报错，返回类型还变宽了。
export function unwrapOr<T>(result: Result<T, unknown>, fallback: NoInfer<T>): T {
  return result.ok ? result.value : fallback;
}

export function attempt<T>(fn: () => T): Result<T, unknown> {
  try {
    return ok(fn());
  } catch (error) {
    return err(error);
  }
}

export function collectResults<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) {
      return result;
    }
    values.push(result.value);
  }
  return ok(values);
}
