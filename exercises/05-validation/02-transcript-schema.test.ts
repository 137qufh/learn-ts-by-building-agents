import { describe, expect, test } from "vitest";
import {
  AssistantMessageSchema,
  loadTranscript,
  MessageSchema,
  ToolCallSchema,
  ToolMessageSchema,
  TranscriptSchema,
} from "./02-transcript-schema.ts";

const transcript = [
  { role: "system", content: "你是一个助手" },
  { role: "user", content: "北京天气怎么样？" },
  {
    role: "assistant",
    content: "",
    toolCalls: [{ id: "call_1", name: "get_weather", arguments: { city: "北京" } }],
  },
  { role: "tool", toolCallId: "call_1", content: "晴，25°C" },
  { role: "assistant", content: "北京今天晴，25°C。" },
];

function paths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((issue) => issue.path) ?? [];
}

describe("各种消息", () => {
  test("一份正常的聊天记录", () => {
    expect(TranscriptSchema.parse(transcript)).toEqual(transcript);
  });

  test("未知的 role 被拒绝", () => {
    const result = MessageSchema.safeParse({ role: "bot", content: "hi" });
    expect(result.success).toBe(false);
    expect(paths(result)).toEqual([["role"]]);
  });

  test("工具调用：id 和 name 不能为空，arguments 必须是对象", () => {
    expect(ToolCallSchema.safeParse({ id: "", name: "x", arguments: {} }).success).toBe(false);
    expect(ToolCallSchema.safeParse({ id: "a", name: "", arguments: {} }).success).toBe(false);
    expect(ToolCallSchema.safeParse({ id: "a", name: "x", arguments: "{}" }).success).toBe(false);
    expect(ToolCallSchema.safeParse({ id: "a", name: "x", arguments: [] }).success).toBe(false);
    expect(ToolCallSchema.safeParse({ id: "a", name: "x", arguments: { q: 1 } }).success).toBe(
      true,
    );
  });

  test("assistant 消息可以没有 toolCalls，但不能是 undefined 或 null", () => {
    expect(AssistantMessageSchema.safeParse({ role: "assistant", content: "" }).success).toBe(true);
    expect(
      AssistantMessageSchema.safeParse({ role: "assistant", content: "", toolCalls: undefined })
        .success,
    ).toBe(false);
    expect(
      AssistantMessageSchema.safeParse({ role: "assistant", content: "", toolCalls: null }).success,
    ).toBe(false);
  });

  test("tool 消息：isError 可选，toolCallId 不能为空", () => {
    expect(
      ToolMessageSchema.safeParse({ role: "tool", toolCallId: "c", content: "x", isError: true })
        .success,
    ).toBe(true);
    expect(
      ToolMessageSchema.safeParse({ role: "tool", toolCallId: "", content: "x" }).success,
    ).toBe(false);
  });

  test("多余的键被丢掉", () => {
    expect(MessageSchema.parse({ role: "user", content: "hi", timestamp: 1 })).toEqual({
      role: "user",
      content: "hi",
    });
  });

  test("错误的位置：第 3 条消息的第 1 个工具调用的 name", () => {
    const broken = structuredClone(transcript);
    (broken[2] as { toolCalls: { name: unknown }[] }).toolCalls[0]!.name = 42;
    expect(paths(TranscriptSchema.safeParse(broken))).toEqual([[2, "toolCalls", 0, "name"]]);
  });
});

describe("loadTranscript", () => {
  test("正常读取", () => {
    expect(loadTranscript(JSON.stringify(transcript))).toEqual({ ok: true, value: transcript });
  });

  test("不是 JSON", () => {
    const result = loadTranscript("{坏掉了");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.startsWith("不是合法的 JSON：")).toBe(true);
  });

  test("结构不对：错误信息是 z.prettifyError 的格式，带上位置", () => {
    const result = loadTranscript(JSON.stringify([{ role: "user" }]));
    expect(result).toEqual({
      ok: false,
      error: "✖ Invalid input: expected string, received undefined\n  → at [0].content",
    });
  });

  test("顶层不是数组", () => {
    expect(loadTranscript('{"messages": []}').ok).toBe(false);
  });
});
