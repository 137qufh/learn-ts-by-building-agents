import { describe, expect, test } from "vitest";
import {
  DEFAULT_SETTINGS,
  changedSettings,
  defaultModelOf,
  getSetting,
  pluck,
  withSetting,
  type ModelSettings,
} from "./02-settings.ts";

describe("getSetting", () => {
  test("读取属性", () => {
    expect(getSetting(DEFAULT_SETTINGS, "maxTokens")).toBe(1024);
    expect(getSetting({ city: "北京" }, "city")).toBe("北京");
  });
});

describe("withSetting", () => {
  test("返回修改后的新对象", () => {
    const updated = withSetting(DEFAULT_SETTINGS, "temperature", 0);
    expect(updated).toStrictEqual({ ...DEFAULT_SETTINGS, temperature: 0 });
  });

  test("不修改原对象", () => {
    const original = { ...DEFAULT_SETTINGS };
    const updated = withSetting(original, "model", "gpt-5-mini");
    expect(updated).not.toBe(original);
    expect(original.model).toBe("gpt-5");
  });
});

describe("pluck", () => {
  test("取出每个元素的同一个属性", () => {
    const calls = [
      { id: "call_1", name: "search" },
      { id: "call_2", name: "read_file" },
    ];
    expect(pluck(calls, "name")).toStrictEqual(["search", "read_file"]);
  });

  test("空数组返回空数组", () => {
    const none: { id: string }[] = [];
    expect(pluck(none, "id")).toStrictEqual([]);
  });
});

describe("defaultModelOf", () => {
  test.each([
    ["openai", "gpt-5"],
    ["anthropic", "claude-sonnet-4-5"],
    ["deepseek", "deepseek-chat"],
  ] as const)("%s → %s", (provider, model) => {
    expect(defaultModelOf(provider)).toBe(model);
  });
});

describe("changedSettings", () => {
  test("相同的配置没有变化", () => {
    expect(changedSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS })).toStrictEqual([]);
  });

  test("按声明顺序返回变化的键", () => {
    const after: ModelSettings = {
      ...DEFAULT_SETTINGS,
      stream: false,
      model: "gpt-5-mini",
      maxTokens: 4096,
    };
    expect(changedSettings(DEFAULT_SETTINGS, after)).toStrictEqual([
      "model",
      "maxTokens",
      "stream",
    ]);
  });

  test("stop 按内容比较", () => {
    const before: ModelSettings = { ...DEFAULT_SETTINGS, stop: ["\n\n", "END"] };
    expect(changedSettings(before, { ...before, stop: ["\n\n", "END"] })).toStrictEqual([]);
    expect(changedSettings(before, { ...before, stop: ["\n\n"] })).toStrictEqual(["stop"]);
    expect(changedSettings(before, { ...before, stop: ["END", "\n\n"] })).toStrictEqual(["stop"]);
  });

  test("忽略运行时多出来的属性", () => {
    const withExtra = { ...DEFAULT_SETTINGS, apiKey: "sk-不该被比较" };
    expect(changedSettings(DEFAULT_SETTINGS, withExtra)).toStrictEqual([]);
  });
});
