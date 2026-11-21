import { describe, expect, test } from "vitest";
import { formatModelId, lastN, lastNonEmpty, splitModelId } from "./02-model-id.ts";

describe("splitModelId", () => {
  test("拆分供应商和模型名", () => {
    expect(splitModelId("anthropic/claude-sonnet")).toEqual(["anthropic", "claude-sonnet"]);
  });

  test("只按第一个 / 拆分", () => {
    expect(splitModelId("openrouter/meta/llama")).toEqual(["openrouter", "meta/llama"]);
  });

  test("没有 / 时供应商为 unknown", () => {
    expect(splitModelId("gpt-5")).toEqual(["unknown", "gpt-5"]);
  });

  test("去掉首尾空白", () => {
    expect(splitModelId("  openai/gpt-5 \n")).toEqual(["openai", "gpt-5"]);
  });

  test.each(["", "   ", "openai/", "/gpt-5", "/"])("无效输入 %j 抛出错误", (input) => {
    expect(() => splitModelId(input)).toThrow(`无效的模型 ID："${input}"`);
  });
});

describe("formatModelId", () => {
  test("拼接供应商和模型名", () => {
    expect(formatModelId(["anthropic", "claude-sonnet"])).toBe("anthropic/claude-sonnet");
  });

  test("供应商为 unknown 时只返回模型名", () => {
    expect(formatModelId(["unknown", "gpt-5"])).toBe("gpt-5");
  });

  test("与 splitModelId 互为逆操作", () => {
    for (const id of ["openai/gpt-5", "gpt-5", "openrouter/meta/llama"]) {
      expect(formatModelId(splitModelId(id))).toBe(id);
    }
  });
});

describe("lastN", () => {
  const messages = ["a", "b", "c", "d"];

  test("返回最后 n 条", () => {
    expect(lastN(messages, 2)).toEqual(["c", "d"]);
  });

  test("n 大于消息总数时返回全部", () => {
    expect(lastN(messages, 10)).toEqual(["a", "b", "c", "d"]);
  });

  test("n 为 0 时返回空数组", () => {
    expect(lastN(messages, 0)).toEqual([]);
  });

  test("n 为负数时返回空数组", () => {
    expect(lastN(messages, -1)).toEqual([]);
  });

  test("返回新数组，不修改原数组", () => {
    const result = lastN(messages, 10);
    expect(result).not.toBe(messages);
    result.push("e");
    expect(messages).toEqual(["a", "b", "c", "d"]);
  });

  test("空列表", () => {
    expect(lastN([], 3)).toEqual([]);
  });
});

describe("lastNonEmpty", () => {
  test("返回最后一条非空消息", () => {
    expect(lastNonEmpty(["hi", "there", ""])).toBe("there");
  });

  test("只含空白的消息也算空", () => {
    expect(lastNonEmpty(["hi", "  ", "\n"])).toBe("hi");
  });

  test("返回原始字符串，不做 trim", () => {
    expect(lastNonEmpty([" hi "])).toBe(" hi ");
  });

  test("找不到时返回 undefined", () => {
    expect(lastNonEmpty(["", " "])).toBeUndefined();
    expect(lastNonEmpty([])).toBeUndefined();
  });
});
