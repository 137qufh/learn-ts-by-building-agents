import { describe, expect, test } from "vitest";
import { defineTools, getField } from "./08-fix-the-types.ts";

// 这道题的重点在类型测试；这里只确认运行时行为没有被改坏。
describe("运行时行为保持不变", () => {
  test("getField 读取属性", () => {
    expect(getField({ model: "gpt-5", maxTokens: 1024 }, "maxTokens")).toBe(1024);
  });

  test("defineTools 原样返回", () => {
    const tools = [{ name: "search", description: "搜索" }];
    expect(defineTools(tools)).toBe(tools);
  });
});
