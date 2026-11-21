import { describe, expect, test } from "vitest";
import {
  STOP_REASONS,
  countReasons,
  describeStopReason,
  nextStep,
  parseStopReason,
} from "./04-stop-reason.ts";

describe("describeStopReason", () => {
  test.each([
    ["end_turn", "模型完成了回答"],
    ["max_tokens", "达到了最大 token 数"],
    ["stop_sequence", "遇到了停止序列"],
    ["tool_use", "模型请求调用工具"],
    ["refusal", "模型拒绝了请求"],
  ] as const)("%s → %s", (reason, label) => {
    expect(describeStopReason(reason)).toBe(label);
  });
});

describe("nextStep", () => {
  test("tool_use 需要执行工具", () => {
    expect(nextStep("tool_use")).toBe("run_tools");
  });

  test("正常结束", () => {
    expect(nextStep("end_turn")).toBe("finish");
    expect(nextStep("stop_sequence")).toBe("finish");
  });

  test("不完整或被拒绝", () => {
    expect(nextStep("max_tokens")).toBe("fail");
    expect(nextStep("refusal")).toBe("fail");
  });
});

describe("parseStopReason", () => {
  test("我们自己的名字原样返回", () => {
    for (const reason of STOP_REASONS) {
      expect(parseStopReason(reason)).toBe(reason);
    }
  });

  test.each([
    ["stop", "end_turn"],
    ["length", "max_tokens"],
    ["tool_calls", "tool_use"],
    ["content_filter", "refusal"],
  ])("OpenAI 风格的 %s → %s", (raw, expected) => {
    expect(parseStopReason(raw)).toBe(expected);
  });

  test("无法识别时返回 undefined", () => {
    expect(parseStopReason("")).toBeUndefined();
    expect(parseStopReason("pause_turn")).toBeUndefined();
  });

  test("大小写敏感，不做 trim", () => {
    expect(parseStopReason("END_TURN")).toBeUndefined();
    expect(parseStopReason(" stop")).toBeUndefined();
  });

  test("不会被对象原型上的属性名骗到", () => {
    expect(parseStopReason("toString")).toBeUndefined();
    expect(parseStopReason("constructor")).toBeUndefined();
    expect(parseStopReason("__proto__")).toBeUndefined();
  });
});

describe("countReasons", () => {
  test("统计每种原因的次数", () => {
    expect(countReasons(["tool_use", "tool_use", "end_turn"])).toStrictEqual({
      end_turn: 1,
      max_tokens: 0,
      stop_sequence: 0,
      tool_use: 2,
      refusal: 0,
    });
  });

  test("空列表时所有原因都是 0", () => {
    expect(countReasons([])).toStrictEqual({
      end_turn: 0,
      max_tokens: 0,
      stop_sequence: 0,
      tool_use: 0,
      refusal: 0,
    });
  });
});
