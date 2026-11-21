import { describe, expect, test } from "vitest";
import { deepFreeze, lastOfRole, ofRole, sumField, type Message } from "./04-messages.ts";

const history: Message[] = [
  { role: "system", content: "你是一个天气助手" },
  { role: "user", content: "北京和上海的天气？" },
  {
    role: "assistant",
    content: "",
    toolCalls: [
      { id: "call_1", name: "get_weather", arguments: '{"city":"北京"}' },
      { id: "call_2", name: "get_weather", arguments: '{"city":"上海"}' },
    ],
  },
  { role: "tool", toolCallId: "call_1", content: "晴，25°C" },
  { role: "tool", toolCallId: "call_2", content: "超时", isError: true },
  { role: "assistant", content: "北京晴，25°C；上海的天气暂时查不到。" },
];

describe("ofRole", () => {
  test("按原顺序返回指定角色的消息", () => {
    expect(ofRole(history, "tool").map((m: { toolCallId: string }) => m.toolCallId)).toStrictEqual([
      "call_1",
      "call_2",
    ]);
  });

  test("没有时返回空数组", () => {
    expect(ofRole([], "user")).toStrictEqual([]);
  });
});

describe("lastOfRole", () => {
  test("返回最后一条", () => {
    expect(lastOfRole(history, "assistant")).toBe(history[5]);
  });

  test("没有时返回 undefined", () => {
    expect(lastOfRole(history.slice(0, 2), "tool")).toBeUndefined();
  });
});

describe("sumField", () => {
  const usages = [
    { model: "gpt-5", inputTokens: 120, outputTokens: 30 },
    { model: "gpt-5-mini", inputTokens: 80, outputTokens: 50 },
  ];

  test("把字段加起来", () => {
    expect(sumField(usages, "inputTokens")).toBe(200);
    expect(sumField(usages, "outputTokens")).toBe(80);
  });

  test("空数组返回 0", () => {
    expect(sumField([], "inputTokens")).toBe(0);
  });
});

describe("deepFreeze", () => {
  test("冻结每一层", () => {
    const config = {
      model: { name: "gpt-5", temperature: 0.7 },
      tools: [{ name: "search", enabled: true }],
    };
    const frozen = deepFreeze(config);
    expect(frozen).toBe(config);
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.model)).toBe(true);
    expect(Object.isFrozen(frozen.tools)).toBe(true);
    expect(Object.isFrozen(frozen.tools[0])).toBe(true);
  });

  test("冻结后修改会抛错（模块代码运行在严格模式下）", () => {
    const frozen = deepFreeze({ model: { name: "gpt-5" } });
    // 类型上已经不允许修改（见类型测试），这里用断言绕过类型检查，验证运行时也真的改不了
    const model = frozen.model as { name: string };
    expect(() => {
      model.name = "other";
    }).toThrow(TypeError);
  });

  test("函数不会被冻结", () => {
    const onEvent = () => {};
    deepFreeze({ onEvent });
    expect(Object.isFrozen(onEvent)).toBe(false);
  });

  test("基本类型原样返回", () => {
    expect(deepFreeze(42)).toBe(42);
    expect(deepFreeze("hi")).toBe("hi");
    expect(deepFreeze(null)).toBe(null);
  });
});
