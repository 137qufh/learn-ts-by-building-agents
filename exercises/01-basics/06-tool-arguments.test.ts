import { describe, expect, test } from "vitest";
import {
  getErrorMessage,
  getString,
  isRecord,
  parseToolArguments,
  requireNumber,
} from "./06-tool-arguments.ts";

describe("isRecord", () => {
  test("普通对象", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  test.each([null, undefined, [], [1, 2], "str", 42, true])("%j 不是普通对象", (value) => {
    expect(isRecord(value)).toBe(false);
  });
});

describe("parseToolArguments", () => {
  test("解析 JSON 对象", () => {
    expect(parseToolArguments('{"query": "TypeScript 7", "limit": 5}')).toEqual({
      query: "TypeScript 7",
      limit: 5,
    });
  });

  test("空字符串或空白得到空对象", () => {
    expect(parseToolArguments("")).toEqual({});
    expect(parseToolArguments("  \n ")).toEqual({});
  });

  test("不是合法 JSON 时抛错", () => {
    expect(() => parseToolArguments("{query: 1}")).toThrow(/^工具参数不是合法的 JSON/);
    expect(() => parseToolArguments('{"a": 1')).toThrow(/^工具参数不是合法的 JSON/);
  });

  test.each(["[1, 2]", "42", '"text"', "null", "true"])("%s 不是对象，抛错", (json) => {
    expect(() => parseToolArguments(json)).toThrow("工具参数必须是 JSON 对象");
  });
});

describe("getString", () => {
  const args = { name: "search", count: 3, empty: "" };

  test("读取字符串参数", () => {
    expect(getString(args, "name")).toBe("search");
  });

  test("空字符串也是字符串", () => {
    expect(getString(args, "empty")).toBe("");
  });

  test("不是字符串时返回 undefined", () => {
    expect(getString(args, "count")).toBeUndefined();
  });

  test("不存在时返回 undefined", () => {
    expect(getString(args, "missing")).toBeUndefined();
  });
});

describe("requireNumber", () => {
  test("读取数字参数", () => {
    expect(requireNumber({ limit: 5 }, "limit")).toBe(5);
    expect(requireNumber({ limit: 0 }, "limit")).toBe(0);
    expect(requireNumber({ t: -0.5 }, "t")).toBe(-0.5);
  });

  test("数字形式的字符串不算数字", () => {
    expect(() => requireNumber({ limit: "5" }, "limit")).toThrow("参数 limit 必须是有限的数字");
  });

  test("缺少参数时抛错", () => {
    expect(() => requireNumber({}, "limit")).toThrow("参数 limit 必须是有限的数字");
  });

  test("NaN 和 Infinity 不算", () => {
    expect(() => requireNumber({ x: Number.NaN }, "x")).toThrow("参数 x 必须是有限的数字");
    expect(() => requireNumber({ x: Infinity }, "x")).toThrow("参数 x 必须是有限的数字");
  });
});

describe("getErrorMessage", () => {
  test("Error 实例", () => {
    expect(getErrorMessage(new Error("连接超时"))).toBe("连接超时");
  });

  test("Error 的子类", () => {
    expect(getErrorMessage(new TypeError("不是函数"))).toBe("不是函数");
  });

  test("message 为空时返回错误名", () => {
    expect(getErrorMessage(new RangeError(""))).toBe("RangeError");
  });

  test("字符串", () => {
    expect(getErrorMessage("网络断开")).toBe("网络断开");
  });

  test("带 message 属性的普通对象", () => {
    expect(getErrorMessage({ message: "限流", code: 429 })).toBe("限流");
  });

  test("message 不是字符串的对象", () => {
    expect(getErrorMessage({ message: 42 })).toBe("未知错误");
  });

  test.each([null, undefined, 42, {}, []])("%j → 未知错误", (value) => {
    expect(getErrorMessage(value)).toBe("未知错误");
  });

  test("可以直接用在 catch 里", () => {
    try {
      JSON.parse("{");
    } catch (error) {
      expect(getErrorMessage(error)).toMatch(/JSON/);
    }
  });
});
