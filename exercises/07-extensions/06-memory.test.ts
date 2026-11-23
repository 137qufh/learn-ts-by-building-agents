import type { Message } from "@learn-ts/agent-kit";
import { describe, expect, test } from "vitest";
import { compactMessages, createMemoryStore } from "./06-memory.ts";

const toolCall = (id: string, name: string): Message => ({
  role: "assistant",
  content: null,
  tool_calls: [{ id, type: "function", function: { name, arguments: "{}" } }],
});
const toolResult = (id: string, content: string): Message => ({
  role: "tool",
  tool_call_id: id,
  content,
});

describe("compactMessages", () => {
  test("放得下就不摘要；system 保留，工具调用整块留下", () => {
    const messages: Message[] = [
      { role: "system", content: "规则" },
      { role: "user", content: "旧问题" },
      toolCall("c1", "add"),
      toolResult("c1", "3"),
    ];
    let called = false;
    const fitted = compactMessages(messages, {
      keep: 10,
      summarize: () => {
        called = true;
        return "不该调用";
      },
    });
    expect(called).toBe(false);
    expect(fitted).toEqual({ messages, covered: 0 });
    expect(fitted.messages).not.toBe(messages);

    const kept = compactMessages(messages, { keep: 1, summarize: () => "摘要" });
    expect(kept.covered).toBe(1);
    expect(kept.messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
    ]);
    expect(kept.messages[1]).toEqual({
      role: "user",
      content: "以下是更早对话的摘要，不是新的问题：\n摘要",
    });
    expect(kept.messages.slice(2)).toEqual(messages.slice(2));
  });

  test("keep 为 0 时除了 system 都折叠；非法 keep 抛错", () => {
    const messages: Message[] = [
      { role: "system", content: "规则" },
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ];
    const result = compactMessages(messages, {
      keep: 0,
      summarize: (dropped) => dropped.length.toString(),
    });
    expect(result.covered).toBe(2);
    expect(result.messages[1]).toMatchObject({
      content: "以下是更早对话的摘要，不是新的问题：\n2",
    });
    expect(() => compactMessages(messages, { keep: -1, summarize: () => "" })).toThrow(RangeError);
    expect(() => compactMessages(messages, { keep: 1.5, summarize: () => "" })).toThrow(RangeError);
  });
});

describe("createMemoryStore", () => {
  test("二字片段能命中，空查询不是列出全部", () => {
    const store = createMemoryStore();
    store.add("买牛奶", 1);
    store.add("buy milk", 2);
    expect(store.search("牛奶").map((item) => item.text)).toEqual(["买牛奶"]);
    expect(store.search("MILK").map((item) => item.text)).toEqual(["buy milk"]);
    expect(store.search("")).toEqual([]);
    expect(store.search("量子")).toEqual([]);
  });

  test("分数相同留更新的；list 和 add 返回副本；空文本和非法 limit", () => {
    const store = createMemoryStore();
    const first = store.add("牛奶", 1);
    store.add("鲜牛奶", 2);
    first.text = "改了";
    expect(store.list()[0]?.text).toBe("牛奶");
    expect(store.search("牛奶").map((item) => item.id)).toEqual(["m2", "m1"]);
    const listed = store.list();
    const item = listed[0];
    if (item === undefined) throw new Error("missing");
    item.text = "又改了";
    expect(store.list()[0]?.text).toBe("牛奶");
    expect(() => store.add("  ")).toThrow(Error);
    expect(store.search("牛奶", 0)).toEqual([]);
    expect(() => store.search("牛奶", -1)).toThrow(RangeError);
  });
});
