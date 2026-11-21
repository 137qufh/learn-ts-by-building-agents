import { describe, expect, test } from "vitest";
import { attempt, collectResults, err, mapResult, ok, unwrapOr, type Result } from "./01-result.ts";

describe("ok / err", () => {
  test("ok 构造成功的结果", () => {
    expect(ok(42)).toStrictEqual({ ok: true, value: 42 });
  });

  test("err 构造失败的结果", () => {
    expect(err("timeout")).toStrictEqual({ ok: false, error: "timeout" });
  });

  test("值可以是 undefined", () => {
    expect(ok(undefined)).toStrictEqual({ ok: true, value: undefined });
  });
});

describe("mapResult", () => {
  test("成功时转换值", () => {
    expect(mapResult(ok(2), (n: number) => n * 10)).toStrictEqual(ok(20));
  });

  test("失败时原样返回，不调用 fn", () => {
    let called = false;
    const failed = err(new Error("boom"));
    const mapped = mapResult(failed, () => {
      called = true;
      return 0;
    });
    expect(mapped).toBe(failed);
    expect(called).toBe(false);
  });
});

describe("unwrapOr", () => {
  test("成功时返回值", () => {
    expect(unwrapOr(ok("晴"), "未知")).toBe("晴");
  });

  test("失败时返回 fallback", () => {
    const failed: Result<string, string> = err("timeout");
    expect(unwrapOr(failed, "未知")).toBe("未知");
  });

  test("成功值是假值时也返回成功值", () => {
    expect(unwrapOr(ok(0), 100)).toBe(0);
    expect(unwrapOr(ok(""), "默认")).toBe("");
  });
});

describe("attempt", () => {
  test("正常返回时包装成成功", () => {
    expect(attempt(() => JSON.parse('{"city":"北京"}'))).toStrictEqual(ok({ city: "北京" }));
  });

  test("抛出异常时包装成失败", () => {
    const result = attempt(() => JSON.parse("{坏的 JSON"));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBeInstanceOf(SyntaxError);
  });

  test("抛出的不是 Error 时也能处理", () => {
    expect(
      attempt(() => {
        throw "字符串也能被 throw";
      }),
    ).toStrictEqual(err("字符串也能被 throw"));
  });
});

describe("collectResults", () => {
  test("全部成功时返回值数组", () => {
    expect(collectResults([ok(1), ok(2), ok(3)])).toStrictEqual(ok([1, 2, 3]));
  });

  test("返回第一个失败", () => {
    expect(collectResults([ok(1), err("第一个"), ok(3), err("第二个")])).toStrictEqual(
      err("第一个"),
    );
  });

  test("空数组算作全部成功", () => {
    expect(collectResults([])).toStrictEqual(ok([]));
  });
});
