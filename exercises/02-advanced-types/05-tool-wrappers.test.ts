import { describe, expect, test } from "vitest";
import { memoize, recorded, withFallback } from "./05-tool-wrappers.ts";

const add = (a: number, b: number) => a + b;
const parse = (text: string): unknown => JSON.parse(text);

describe("recorded", () => {
  test("转发调用并记录参数和结果", () => {
    const tool = recorded(add);
    expect(tool.fn(1, 2)).toBe(3);
    expect(tool.fn(10, 20)).toBe(30);
    expect(tool.calls).toStrictEqual([
      { args: [1, 2], ok: true, result: 3 },
      { args: [10, 20], ok: true, result: 30 },
    ]);
  });

  test("记录失败并原样重新抛出", () => {
    const tool = recorded(parse);
    expect(() => tool.fn("{坏的")).toThrow(SyntaxError);
    expect(tool.calls).toHaveLength(1);
    const record = tool.calls[0];
    expect(record).toMatchObject({ args: ["{坏的"], ok: false });
    expect(record?.ok === false && record.error).toBeInstanceOf(SyntaxError);
  });

  test("还没调用时没有记录", () => {
    expect(recorded(add).calls).toStrictEqual([]);
  });
});

describe("withFallback", () => {
  test("正常时返回原函数的结果", () => {
    expect(withFallback(parse, null)('{"ok":true}')).toStrictEqual({ ok: true });
  });

  test("抛出异常时返回 fallback", () => {
    expect(withFallback(parse, null)("{坏的")).toBeNull();
  });
});

describe("memoize", () => {
  test("同一个参数只调用一次", () => {
    let calls = 0;
    const lookup = memoize((city: string) => {
      calls++;
      return `${city} 晴`;
    });
    expect(lookup("北京")).toBe("北京 晴");
    expect(lookup("北京")).toBe("北京 晴");
    expect(lookup("上海")).toBe("上海 晴");
    expect(calls).toBe(2);
  });

  test("缓存假值结果", () => {
    let calls = 0;
    const isEven = memoize((n: number) => {
      calls++;
      return n % 2 === 0 ? 0 : "";
    });
    isEven(1);
    isEven(1);
    expect(calls).toBe(1);
  });

  test("抛出异常的调用不缓存", () => {
    let calls = 0;
    const flaky = memoize((key: string) => {
      calls++;
      if (calls === 1) {
        throw new Error("第一次失败");
      }
      return key;
    });
    expect(() => flaky("a")).toThrow("第一次失败");
    expect(flaky("a")).toBe("a");
    expect(flaky("a")).toBe("a");
    expect(calls).toBe(2);
  });
});
