import type { ChatRequest, StreamEvent } from "@learn-ts/agent-kit";
import { describe, expect, test } from "vitest";
import { createScriptedModel } from "./02-scripted-model.ts";

async function collect(stream: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const list: StreamEvent[] = [];
  for await (const event of stream) list.push(event);
  return list;
}

const request = (content: string): ChatRequest => ({ messages: [{ role: "user", content }] });

describe("createScriptedModel", () => {
  test("文本按 chunkSize 个字符切成多个事件（按字符，不切开 emoji）", async () => {
    const model = createScriptedModel([{ text: "你好，世界🙂！" }], { chunkSize: 3 });
    expect(await collect(model.stream(request("hi")))).toEqual([
      { type: "text", text: "你好，" },
      { type: "text", text: "世界🙂" },
      { type: "text", text: "！" },
      { type: "finish", reason: "stop" },
    ]);
  });

  test("默认每 4 个字符一个事件；没有文本时不产生 text 事件", async () => {
    const model = createScriptedModel([{ text: "abcdefgh" }, {}]);
    const first = await collect(model.stream(request("a")));
    expect(first.filter((e) => e.type === "text")).toHaveLength(2);
    expect(await collect(model.stream(request("b")))).toEqual([{ type: "finish", reason: "stop" }]);
  });

  test("工具调用：参数可以是对象或字符串；id 默认按整个脚本从 call_1 开始编号", async () => {
    const model = createScriptedModel([
      { text: "查一下", toolCalls: [{ name: "a", arguments: { x: 1 } }, { name: "b" }] },
      {
        toolCalls: [
          { name: "c", arguments: "{bad" },
          { id: "mine", name: "d" },
        ],
      },
    ]);
    expect(await collect(model.stream(request("1")))).toEqual([
      { type: "text", text: "查一下" },
      { type: "tool_call", call: { id: "call_1", name: "a", arguments: '{"x":1}' } },
      { type: "tool_call", call: { id: "call_2", name: "b", arguments: "{}" } },
      { type: "finish", reason: "tool_calls" },
    ]);
    expect(await collect(model.stream(request("2")))).toEqual([
      { type: "tool_call", call: { id: "call_3", name: "c", arguments: "{bad" } },
      { type: "tool_call", call: { id: "mine", name: "d", arguments: "{}" } },
      { type: "finish", reason: "tool_calls" },
    ]);
  });

  test("可以指定结束原因和用量", async () => {
    const usage = { inputTokens: 5, outputTokens: 2 };
    const model = createScriptedModel([{ text: "x", finishReason: "length", usage }]);
    expect((await collect(model.stream(request("1")))).at(-1)).toEqual({
      type: "finish",
      reason: "length",
      usage,
    });
  });

  test("记录收到的请求，而且是副本：之后修改原来的数组不影响记录", async () => {
    const model = createScriptedModel([{ text: "1" }, { text: "2" }]);
    const req = request("第一句");
    await collect(model.stream(req));
    req.messages.push({ role: "assistant", content: "后来加的" });
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0]?.messages).toEqual([{ role: "user", content: "第一句" }]);
    expect(model.remaining).toBe(1);
  });

  test("一步可以是函数：根据请求决定怎么回复，拿到的是记录下来的那份请求", async () => {
    const model = createScriptedModel([(req) => ({ text: `你说了 ${req.messages.length} 句话` })]);
    const events = await collect(
      model.stream({
        messages: [
          { role: "user", content: "a" },
          { role: "user", content: "b" },
        ],
      }),
    );
    expect(events[0]).toEqual({ type: "text", text: "你说了 " });
    expect(events.map((e) => (e.type === "text" ? e.text : "")).join("")).toBe("你说了 2 句话");
  });

  test("fail：先交出 afterText，再抛出指定的错误（模拟流到一半断开）", async () => {
    const broken = new Error("连接断开");
    const model = createScriptedModel([{ fail: broken, afterText: "说到一半" }]);
    const seen: StreamEvent[] = [];
    await expect(async () => {
      for await (const event of model.stream(request("1"))) seen.push(event);
    }).rejects.toBe(broken);
    expect(seen).toEqual([{ type: "text", text: "说到一半" }]);
  });

  test("脚本用完时报告清楚的错误", async () => {
    const model = createScriptedModel([{ text: "只有一步" }]);
    await collect(model.stream(request("1")));
    await expect(collect(model.stream(request("2")))).rejects.toThrow(
      "脚本已经用完：模型被调用了第 2 次，脚本只有 1 步",
    );
  });

  test("已经取消的 signal：立刻抛出它的 reason，不消耗脚本", async () => {
    const model = createScriptedModel([{ text: "x" }]);
    const controller = new AbortController();
    const reason = new Error("取消");
    controller.abort(reason);
    await expect(collect(model.stream(request("1"), { signal: controller.signal }))).rejects.toBe(
      reason,
    );
    expect(model.remaining).toBe(1);
    expect(model.requests).toHaveLength(0);
  });

  test("delayMs：每个事件之前等一会儿，等待中取消会立刻停下", async () => {
    const model = createScriptedModel([{ text: "abcdefgh" }], { chunkSize: 1, delayMs: 20 });
    const controller = new AbortController();
    const seen: string[] = [];
    const started = performance.now();
    await expect(async () => {
      for await (const event of model.stream(request("1"), { signal: controller.signal })) {
        if (event.type === "text") seen.push(event.text);
        if (seen.length === 2) controller.abort(new Error("停"));
      }
    }).rejects.toThrow("停");
    expect(seen).toEqual(["a", "b"]);
    expect(performance.now() - started).toBeGreaterThanOrEqual(35);
  });

  test("chunkSize 必须是正整数", () => {
    expect(() => createScriptedModel([], { chunkSize: 0 })).toThrow(RangeError);
    expect(() => createScriptedModel([], { chunkSize: 1.5 })).toThrow(RangeError);
  });
});
