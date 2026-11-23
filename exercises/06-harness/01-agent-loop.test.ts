import type { ChatRequest, Message, RawToolCall, StreamEvent } from "@learn-ts/agent-kit";
import { describe, expect, test } from "vitest";
import {
  assistantMessage,
  collectTurn,
  runAgentLoop,
  type Model,
  type ToolExecutor,
} from "./01-agent-loop.ts";

async function* events(...list: StreamEvent[]): AsyncGenerator<StreamEvent> {
  yield* list;
}

/** 一个最小的假模型：按顺序交出准备好的事件，记下每次收到的请求。 */
function fakeModel(replies: StreamEvent[][]): Model & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  return {
    requests,
    stream(request) {
      requests.push(request);
      const reply = replies.shift();
      if (reply === undefined) throw new Error("假模型的回复用完了");
      return events(...reply);
    },
  };
}

const call = (id: string, name: string, args: unknown): StreamEvent => ({
  type: "tool_call",
  call: { id, name, arguments: JSON.stringify(args) },
});
const finish = (reason: string): StreamEvent => ({ type: "finish", reason });

function fakeTools(): ToolExecutor & { calls: RawToolCall[] } {
  const calls: RawToolCall[] = [];
  return {
    calls,
    schemas: () => [{ name: "add", description: "加法", parameters: { type: "object" } }],
    async dispatch(toolCall) {
      calls.push(toolCall);
      const { a, b } = JSON.parse(toolCall.arguments) as { a: number; b: number };
      return { id: toolCall.id, ok: true, content: String(a + b) };
    },
  };
}

describe("collectTurn", () => {
  test("拼接文本，收集工具调用，记下结束原因和用量", async () => {
    const turn = await collectTurn(
      events(
        { type: "text", text: "我算" },
        { type: "text", text: "一下" },
        call("c1", "add", { a: 1, b: 2 }),
        { type: "finish", reason: "tool_calls", usage: { inputTokens: 10, outputTokens: 3 } },
      ),
    );
    expect(turn).toEqual({
      text: "我算一下",
      toolCalls: [{ id: "c1", name: "add", arguments: '{"a":1,"b":2}' }],
      finishReason: "tool_calls",
      usage: { inputTokens: 10, outputTokens: 3 },
    });
  });

  test("没有用量时不出现 usage 属性；没有 finish 时结束原因是 unknown", async () => {
    const turn = await collectTurn(events({ type: "text", text: "hi" }));
    expect(turn).toEqual({ text: "hi", toolCalls: [], finishReason: "unknown" });
    expect("usage" in turn).toBe(false);
  });
});

describe("assistantMessage", () => {
  test("没有工具调用：不写 tool_calls", () => {
    const message = assistantMessage({ text: "好的", toolCalls: [] });
    expect(message).toEqual({ role: "assistant", content: "好的" });
    expect("tool_calls" in message).toBe(false);
  });

  test("有工具调用：转换成接口的格式；没有文本时 content 是 null", () => {
    expect(
      assistantMessage({ text: "", toolCalls: [{ id: "c1", name: "add", arguments: "{}" }] }),
    ).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [{ id: "c1", type: "function", function: { name: "add", arguments: "{}" } }],
    });
  });
});

describe("runAgentLoop", () => {
  test("模型 → 工具 → 模型：聊天记录的顺序和内容", async () => {
    const model = fakeModel([
      [call("c1", "add", { a: 1, b: 2 }), call("c2", "add", { a: 3, b: 4 }), finish("tool_calls")],
      [{ type: "text", text: "3 和 7" }, finish("stop")],
    ]);
    const tools = fakeTools();
    const input: Message[] = [{ role: "user", content: "算 1+2 和 3+4" }];
    const result = await runAgentLoop({ model, tools, messages: input });

    expect(result.stopReason).toBe("completed");
    expect(result.steps).toBe(2);
    expect(result.text).toBe("3 和 7");
    expect(result.messages).toEqual([
      { role: "user", content: "算 1+2 和 3+4" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "c1", type: "function", function: { name: "add", arguments: '{"a":1,"b":2}' } },
          { id: "c2", type: "function", function: { name: "add", arguments: '{"a":3,"b":4}' } },
        ],
      },
      { role: "tool", tool_call_id: "c1", content: "3" },
      { role: "tool", tool_call_id: "c2", content: "7" },
      { role: "assistant", content: "3 和 7" },
    ]);
    expect(tools.calls.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(input).toHaveLength(1); // 不修改传入的数组
  });

  test("每次请求都带上工具的描述，并且是那一刻聊天记录的副本", async () => {
    const model = fakeModel([
      [call("c1", "add", { a: 1, b: 1 }), finish("tool_calls")],
      [{ type: "text", text: "2" }, finish("stop")],
    ]);
    await runAgentLoop({ model, tools: fakeTools(), messages: [{ role: "user", content: "1+1" }] });
    expect(model.requests).toHaveLength(2);
    expect(model.requests[0]?.messages).toHaveLength(1);
    expect(model.requests[1]?.messages).toHaveLength(3);
    expect(model.requests[0]?.tools?.map((t) => t.name)).toEqual(["add"]);
  });

  test("没有工具时请求里不出现 tools", async () => {
    const model = fakeModel([[{ type: "text", text: "你好" }, finish("stop")]]);
    const tools: ToolExecutor = {
      schemas: () => [],
      dispatch: () => Promise.reject(new Error("不该调用")),
    };
    await runAgentLoop({ model, tools, messages: [{ role: "user", content: "hi" }] });
    expect("tools" in (model.requests[0] ?? {})).toBe(false);
  });

  test("达到 maxSteps 就停下", async () => {
    const forever = Array.from({ length: 5 }, (_, i) => [
      call(`c${i}`, "add", { a: i, b: 0 }),
      finish("tool_calls"),
    ]);
    const model = fakeModel(forever);
    const result = await runAgentLoop({ model, tools: fakeTools(), messages: [], maxSteps: 3 });
    expect(result).toMatchObject({ stopReason: "max_steps", steps: 3, text: "" });
    expect(model.requests).toHaveLength(3);
    // 最后一步的工具也执行了：聊天记录里每个调用都有结果
    expect(result.messages.filter((m) => m.role === "tool")).toHaveLength(3);
  });

  test("默认最多 10 步", async () => {
    const forever = Array.from({ length: 11 }, (_, i) => [
      call(`c${i}`, "add", { a: 0, b: 0 }),
      finish("tool_calls"),
    ]);
    const result = await runAgentLoop({
      model: fakeModel(forever),
      tools: fakeTools(),
      messages: [],
    });
    expect(result.steps).toBe(10);
  });
});
