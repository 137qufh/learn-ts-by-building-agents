import { describe, expect, test } from "vitest";
import { camelizeKeys, isNamespaced, namespaced, parseToolName, toCamelCase } from "./06-naming.ts";

describe("namespaced", () => {
  test("用 __ 连接服务器名和工具名", () => {
    expect(namespaced("github", "create_issue")).toBe("github__create_issue");
  });
});

describe("isNamespaced", () => {
  test.each([
    ["github__search", true],
    ["a__b__c", true],
    ["search", false],
    ["single_underscore", false],
  ])("%s → %s", (name, expected) => {
    expect(isNamespaced(name)).toBe(expected);
  });
});

describe("parseToolName", () => {
  test("在第一个 __ 处拆开", () => {
    expect(parseToolName("github__create_issue")).toStrictEqual({
      server: "github",
      tool: "create_issue",
    });
    expect(parseToolName("a__b__c")).toStrictEqual({ server: "a", tool: "b__c" });
  });

  test("没有 __ 时返回 undefined", () => {
    expect(parseToolName("search")).toBeUndefined();
  });
});

describe("toCamelCase", () => {
  test.each([
    ["finish_reason", "finishReason"],
    ["prompt_tokens_details", "promptTokensDetails"],
    ["content", "content"],
    ["", ""],
    // 和 CamelCase 类型的结果保持一致
    ["a__b", "aB"],
    ["trailing_", "trailing"],
  ])("%s → %s", (input, expected) => {
    expect(toCamelCase(input)).toBe(expected);
  });
});

describe("camelizeKeys", () => {
  test("只转换第一层的键", () => {
    expect(
      camelizeKeys({ finish_reason: "stop", index: 0, usage: { prompt_tokens: 1 } }),
    ).toStrictEqual({ finishReason: "stop", index: 0, usage: { prompt_tokens: 1 } });
  });

  test("不修改原对象", () => {
    const raw = { total_tokens: 3 };
    const result = camelizeKeys(raw);
    expect(result).not.toBe(raw);
    expect(raw).toStrictEqual({ total_tokens: 3 });
  });
});
