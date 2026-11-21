import { describe, expect, test } from "vitest";
import {
  assistantMessage,
  countByRole,
  pendingToolCalls,
  renderMessage,
  renderTranscript,
  systemMessage,
  toolMessage,
  userMessage,
  validateTranscript,
  type ToolCall,
  type Transcript,
} from "./transcript.ts";

const search: ToolCall = { id: "call_1", name: "search", arguments: { query: "TypeScript 7" } };
const weather: ToolCall = { id: "call_2", name: "weather", arguments: { city: "上海" } };

/** 一份完整、合法的记录：用户提问 → 模型调用两个工具 → 工具返回 → 模型回答 */
const conversation: Transcript = [
  { role: "system", content: "你是一个乐于助人的助手。" },
  { role: "user", content: "TypeScript 7 有什么新东西？顺便看看上海天气。" },
  { role: "assistant", content: "我来查一下。", toolCalls: [search, weather] },
  { role: "tool", toolCallId: "call_1", content: "原生编译器，快 10 倍" },
  { role: "tool", toolCallId: "call_2", content: "服务不可用", isError: true },
  { role: "assistant", content: "TypeScript 7 的编译器用 Go 重写了；天气暂时查不到。" },
];

describe("构造函数", () => {
  test("systemMessage / userMessage", () => {
    expect(systemMessage("规则")).toStrictEqual({ role: "system", content: "规则" });
    expect(userMessage("你好")).toStrictEqual({ role: "user", content: "你好" });
  });

  test("assistantMessage 不带工具调用时没有 toolCalls 属性", () => {
    expect(assistantMessage("好的")).toStrictEqual({ role: "assistant", content: "好的" });
  });

  test("assistantMessage 的工具调用为空数组时也没有 toolCalls 属性", () => {
    expect(assistantMessage("好的", [])).toStrictEqual({ role: "assistant", content: "好的" });
  });

  test("assistantMessage 带工具调用", () => {
    expect(assistantMessage("", [search])).toStrictEqual({
      role: "assistant",
      content: "",
      toolCalls: [search],
    });
  });

  test("toolMessage 成功时没有 isError 属性", () => {
    expect(toolMessage("call_1", "ok")).toStrictEqual({
      role: "tool",
      toolCallId: "call_1",
      content: "ok",
    });
    expect(toolMessage("call_1", "ok", { isError: false })).toStrictEqual({
      role: "tool",
      toolCallId: "call_1",
      content: "ok",
    });
  });

  test("toolMessage 失败时 isError 为 true", () => {
    expect(toolMessage("call_1", "boom", { isError: true })).toStrictEqual({
      role: "tool",
      toolCallId: "call_1",
      content: "boom",
      isError: true,
    });
  });
});

describe("renderMessage", () => {
  test("system 和 user", () => {
    expect(renderMessage({ role: "system", content: "规则" })).toBe("[system] 规则");
    expect(renderMessage({ role: "user", content: "你好" })).toBe("[user] 你好");
  });

  test("assistant 不带工具调用", () => {
    expect(renderMessage({ role: "assistant", content: "你好！" })).toBe("[assistant] 你好！");
  });

  test("assistant 带工具调用：每个调用一行", () => {
    expect(
      renderMessage({ role: "assistant", content: "我来查一下。", toolCalls: [search, weather] }),
    ).toBe(
      [
        "[assistant] 我来查一下。",
        '  → search({"query":"TypeScript 7"}) #call_1',
        '  → weather({"city":"上海"}) #call_2',
      ].join("\n"),
    );
  });

  test("assistant 只调用工具、不说话", () => {
    expect(renderMessage({ role: "assistant", content: "", toolCalls: [search] })).toBe(
      '[assistant]\n  → search({"query":"TypeScript 7"}) #call_1',
    );
  });

  test("工具参数为空对象", () => {
    expect(
      renderMessage({
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c", name: "now", arguments: {} }],
      }),
    ).toBe("[assistant]\n  → now({}) #c");
  });

  test("tool 成功", () => {
    expect(renderMessage({ role: "tool", toolCallId: "call_1", content: "42" })).toBe(
      "[tool #call_1] 42",
    );
  });

  test("tool 失败", () => {
    expect(
      renderMessage({ role: "tool", toolCallId: "call_2", content: "超时", isError: true }),
    ).toBe("[tool #call_2] ERROR: 超时");
  });

  test("content 为空时不留多余空格", () => {
    expect(renderMessage({ role: "user", content: "" })).toBe("[user]");
    expect(renderMessage({ role: "tool", toolCallId: "c", content: "" })).toBe("[tool #c]");
    expect(renderMessage({ role: "tool", toolCallId: "c", content: "", isError: true })).toBe(
      "[tool #c] ERROR:",
    );
  });
});

describe("renderTranscript", () => {
  test("逐条渲染并用换行连接", () => {
    expect(renderTranscript(conversation)).toBe(
      [
        "[system] 你是一个乐于助人的助手。",
        "[user] TypeScript 7 有什么新东西？顺便看看上海天气。",
        "[assistant] 我来查一下。",
        '  → search({"query":"TypeScript 7"}) #call_1',
        '  → weather({"city":"上海"}) #call_2',
        "[tool #call_1] 原生编译器，快 10 倍",
        "[tool #call_2] ERROR: 服务不可用",
        "[assistant] TypeScript 7 的编译器用 Go 重写了；天气暂时查不到。",
      ].join("\n"),
    );
  });

  test("空记录得到空字符串", () => {
    expect(renderTranscript([])).toBe("");
  });
});

describe("countByRole", () => {
  test("统计每种角色", () => {
    expect(countByRole(conversation)).toStrictEqual({ system: 1, user: 1, assistant: 2, tool: 2 });
  });

  test("空记录全部为 0", () => {
    expect(countByRole([])).toStrictEqual({ system: 0, user: 0, assistant: 0, tool: 0 });
  });
});

describe("pendingToolCalls", () => {
  test("所有调用都有结果时为空", () => {
    expect(pendingToolCalls(conversation)).toEqual([]);
  });

  test("刚发起调用、还没有结果", () => {
    const transcript: Transcript = [
      { role: "user", content: "查一下" },
      { role: "assistant", content: "", toolCalls: [search, weather] },
    ];
    expect(pendingToolCalls(transcript)).toEqual([search, weather]);
  });

  test("部分调用有了结果", () => {
    const transcript: Transcript = [
      { role: "assistant", content: "", toolCalls: [search, weather] },
      { role: "tool", toolCallId: "call_2", content: "晴" },
    ];
    expect(pendingToolCalls(transcript)).toEqual([search]);
  });

  test("失败的结果也算有了结果", () => {
    const transcript: Transcript = [
      { role: "assistant", content: "", toolCalls: [search] },
      { role: "tool", toolCallId: "call_1", content: "boom", isError: true },
    ];
    expect(pendingToolCalls(transcript)).toEqual([]);
  });

  test("出现在调用之前的同 ID 结果不算", () => {
    const transcript: Transcript = [
      { role: "tool", toolCallId: "call_1", content: "来早了" },
      { role: "assistant", content: "", toolCalls: [search] },
    ];
    expect(pendingToolCalls(transcript)).toEqual([search]);
  });

  test("跨越多条 assistant 消息，按发起顺序返回", () => {
    const transcript: Transcript = [
      { role: "assistant", content: "", toolCalls: [search] },
      { role: "assistant", content: "", toolCalls: [weather] },
    ];
    expect(pendingToolCalls(transcript)).toEqual([search, weather]);
  });

  test("没有任何消息", () => {
    expect(pendingToolCalls([])).toEqual([]);
  });
});

describe("validateTranscript", () => {
  test("合法的记录没有问题", () => {
    expect(validateTranscript(conversation)).toEqual([]);
  });

  test("空记录没有问题", () => {
    expect(validateTranscript([])).toEqual([]);
  });

  test("以等待中的工具调用结尾是允许的", () => {
    expect(validateTranscript(conversation.slice(0, 4))).toEqual([]);
  });

  test("system 消息不在开头", () => {
    expect(
      validateTranscript([
        { role: "user", content: "hi" },
        { role: "system", content: "迟到的规则" },
      ]),
    ).toEqual(["第 2 条：system 消息只能出现在开头"]);
  });

  test("工具调用 ID 重复", () => {
    expect(
      validateTranscript([
        { role: "assistant", content: "", toolCalls: [search] },
        { role: "tool", toolCallId: "call_1", content: "ok" },
        { role: "assistant", content: "", toolCalls: [{ ...weather, id: "call_1" }] },
      ]),
    ).toEqual(["第 3 条：工具调用 ID call_1 重复"]);
  });

  test("tool 消息引用了未知的调用", () => {
    expect(
      validateTranscript([
        { role: "user", content: "hi" },
        { role: "tool", toolCallId: "call_9", content: "???" },
      ]),
    ).toEqual(["第 2 条：tool 消息引用了未知的工具调用 call_9"]);
  });

  test("同一个调用被回应两次", () => {
    expect(
      validateTranscript([
        { role: "assistant", content: "", toolCalls: [search] },
        { role: "tool", toolCallId: "call_1", content: "第一次" },
        { role: "tool", toolCallId: "call_1", content: "第二次" },
      ]),
    ).toEqual(["第 3 条：工具调用 call_1 被重复回应"]);
  });

  test("工具调用还没有结果时出现了 user 消息", () => {
    expect(
      validateTranscript([
        { role: "assistant", content: "", toolCalls: [search, weather] },
        { role: "user", content: "怎么还没好？" },
      ]),
    ).toEqual(["第 2 条：工具调用 call_1, call_2 还没有结果，不能出现 user 消息"]);
  });

  test("报告之后，这些调用依然在等待", () => {
    expect(
      validateTranscript([
        { role: "assistant", content: "", toolCalls: [search, weather] },
        { role: "tool", toolCallId: "call_1", content: "ok" },
        { role: "assistant", content: "插嘴" },
        { role: "tool", toolCallId: "call_2", content: "晴" },
        { role: "user", content: "现在可以了" },
      ]),
    ).toEqual(["第 3 条：工具调用 call_2 还没有结果，不能出现 assistant 消息"]);
  });

  test("一次报告多个问题，按出现顺序排列", () => {
    expect(
      validateTranscript([
        { role: "system", content: "规则" },
        { role: "tool", toolCallId: "call_0", content: "?" },
        { role: "system", content: "又一条规则" },
        { role: "assistant", content: "", toolCalls: [search] },
        { role: "user", content: "嗯？" },
      ]),
    ).toEqual([
      "第 2 条：tool 消息引用了未知的工具调用 call_0",
      "第 3 条：system 消息只能出现在开头",
      "第 5 条：工具调用 call_1 还没有结果，不能出现 user 消息",
    ]);
  });
});
