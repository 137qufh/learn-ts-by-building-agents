import { describe, expect, test } from "vitest";
import {
  backoffDelay,
  backoffSchedule,
  compose,
  truncateTo,
  type Transform,
} from "./03-backoff.ts";

describe("backoffDelay", () => {
  test("使用默认值：500、1000、2000……", () => {
    expect(backoffDelay(1)).toBe(500);
    expect(backoffDelay(2)).toBe(1000);
    expect(backoffDelay(3)).toBe(2000);
  });

  test("不超过默认上限 30 秒", () => {
    expect(backoffDelay(10)).toBe(30_000);
  });

  test("可以只覆盖部分选项", () => {
    expect(backoffDelay(3, { baseMs: 100 })).toBe(400);
    expect(backoffDelay(3, { factor: 3 })).toBe(4500);
    expect(backoffDelay(3, { maxMs: 1500 })).toBe(1500);
  });

  test("factor 为 1 时等待时间不变", () => {
    expect(backoffDelay(5, { baseMs: 200, factor: 1 })).toBe(200);
  });

  test("baseMs 可以是 0", () => {
    expect(backoffDelay(4, { baseMs: 0 })).toBe(0);
  });

  test.each([0, -1, 1.5, Number.NaN])("attempt 为 %s 时抛出 RangeError", (attempt) => {
    expect(() => backoffDelay(attempt)).toThrow(RangeError);
  });
});

describe("backoffSchedule", () => {
  test("列出每次重试的等待时间", () => {
    expect(backoffSchedule(4)).toEqual([500, 1000, 2000, 4000]);
  });

  test("选项会传递给每一次计算", () => {
    expect(backoffSchedule(3, { baseMs: 1000, maxMs: 2500 })).toEqual([1000, 2000, 2500]);
  });

  test("0 次重试", () => {
    expect(backoffSchedule(0)).toEqual([]);
  });
});

describe("compose", () => {
  const trim: Transform = (s) => s.trim();
  const upper: Transform = (s) => s.toUpperCase();
  const exclaim: Transform = (s) => `${s}!`;

  test("从左到右依次执行", () => {
    expect(compose(trim, upper, exclaim)("  hi  ")).toBe("HI!");
  });

  test("顺序很重要", () => {
    expect(compose(exclaim, trim)(" hi ")).toBe("hi !");
    expect(compose(trim, exclaim)(" hi ")).toBe("hi!");
  });

  test("没有步骤时原样返回", () => {
    expect(compose()("unchanged")).toBe("unchanged");
  });

  test("组合出的函数可以反复调用", () => {
    const shout = compose(trim, upper);
    expect(shout(" a ")).toBe("A");
    expect(shout(" b ")).toBe("B");
  });

  test("调用 compose 本身不会执行任何步骤", () => {
    let calls = 0;
    const counted: Transform = (s) => {
      calls += 1;
      return s;
    };
    const composed = compose(counted, counted);
    expect(calls).toBe(0);
    composed("x");
    expect(calls).toBe(2);
  });
});

describe("truncateTo", () => {
  test("超过长度时截断并加省略号", () => {
    expect(truncateTo(5)("hello world")).toBe("hello…");
  });

  test("不超过长度时原样返回", () => {
    expect(truncateTo(5)("hello")).toBe("hello");
    expect(truncateTo(5)("hi")).toBe("hi");
  });

  test("可以和 compose 一起使用", () => {
    const preview = compose((s) => s.trim(), truncateTo(3));
    expect(preview("   abcdef   ")).toBe("abc…");
  });
});
