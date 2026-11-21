import { describe, expectTypeOf, test } from "vitest";
import { attempt, collectResults, err, mapResult, ok, unwrapOr, type Result } from "./01-result.ts";

describe("Result", () => {
  test("是成功和失败两种情况的联合", () => {
    expectTypeOf<Result<number, string>>().toEqualTypeOf<
      { ok: true; value: number } | { ok: false; error: string }
    >();
  });

  test("错误类型默认是 Error", () => {
    expectTypeOf<Result<number>>().toEqualTypeOf<Result<number, Error>>();
  });
});

describe("ok / err", () => {
  test("ok(1) 是 Result<number, never>", () => {
    expectTypeOf(ok(1)).toEqualTypeOf<Result<number, never>>();
  });

  test('err("timeout") 是 Result<never, string>', () => {
    expectTypeOf(err("timeout")).toEqualTypeOf<Result<never, string>>();
  });

  test("可以赋值给更具体的 Result", () => {
    const success: Result<number, string> = ok(1);
    const failure: Result<number, string> = err("timeout");
    expectTypeOf(success).toEqualTypeOf(failure);
  });
});

describe("mapResult", () => {
  test("值类型随 fn 改变，错误类型保持不变", () => {
    const parsed: Result<string, SyntaxError> = ok("42");
    expectTypeOf(mapResult(parsed, (text) => Number(text))).toEqualTypeOf<
      Result<number, SyntaxError>
    >();
  });

  test("fn 的参数类型是成功值的类型", () => {
    mapResult(ok("hi"), (value) => {
      expectTypeOf(value).toEqualTypeOf<string>();
      return value;
    });
  });
});

describe("unwrapOr", () => {
  test("返回成功值的类型", () => {
    const result: Result<string, Error> = ok("晴");
    expectTypeOf(unwrapOr(result, "未知")).toEqualTypeOf<string>();
  });

  test("fallback 类型不对时报错", () => {
    const result: Result<number, Error> = ok(1);
    // @ts-expect-error -- fallback 必须是 number
    unwrapOr(result, "x");
  });
});

describe("attempt", () => {
  test("值类型来自 fn 的返回值，错误类型是 unknown", () => {
    expectTypeOf(attempt(() => 42)).toEqualTypeOf<Result<number, unknown>>();
  });
});

describe("collectResults", () => {
  test("Result<T, E>[] 合并成 Result<T[], E>", () => {
    const results: Result<number, string>[] = [ok(1), err("x")];
    expectTypeOf(collectResults(results)).toEqualTypeOf<Result<number[], string>>();
  });
});
