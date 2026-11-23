import { ApiError, type Message, type RawToolCall } from "@learn-ts/agent-kit";
import { describe, expect, test } from "vitest";
import {
  MISSING_RESULT,
  afterTurn,
  createRepeatDetector,
  repairHistory,
  shouldRetryStep,
  stableStringify,
} from "./05-stop-and-recover.ts";

describe("afterTurn", () => {
  test("有工具调用：执行工具（有的服务商这时给的是 stop 或者没有结束原因）", () => {
    expect(afterTurn("tool_calls", 1)).toBe("run_tools");
    expect(afterTurn("stop", 2)).toBe("run_tools");
    expect(afterTurn("unknown", 1)).toBe("run_tools");
  });

  test("没有工具调用：stop 和 unknown 是正常完成", () => {
    expect(afterTurn("stop", 0)).toEqual({ type: "completed" });
    expect(afterTurn("unknown", 0)).toEqual({ type: "completed" });
  });

  test("length：回答被截断了，哪怕有工具调用也不执行（参数可能不完整）", () => {
    expect(afterTurn("length", 0)).toEqual({ type: "length" });
    expect(afterTurn("length", 1)).toEqual({ type: "length" });
  });

  test("content_filter 和不认识的原因：模型停下了", () => {
    expect(afterTurn("content_filter", 1)).toEqual({
      type: "model_stopped",
      finishReason: "content_filter",
    });
    expect(afterTurn("tool_calls", 0)).toEqual({
      type: "model_stopped",
      finishReason: "tool_calls",
    });
    expect(afterTurn("something_new", 0)).toEqual({
      type: "model_stopped",
      finishReason: "something_new",
    });
  });
});

describe("stableStringify", () => {
  test("对象的键按顺序排列，嵌套的也一样", () => {
    expect(stableStringify({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: "s" } })).toBe(
      '{"a":{"c":"s","d":[1,{"x":1,"y":2}]},"b":1}',
    );
  });

  test("和 JSON.stringify 一样处理 undefined：对象里省略，数组里变成 null", () => {
    expect(stableStringify({ a: undefined, b: [undefined, 1] })).toBe('{"b":[null,1]}');
    expect(stableStringify(undefined)).toBe("null");
    expect(stableStringify("x")).toBe('"x"');
    expect(stableStringify(null)).toBe("null");
  });
});

describe("createRepeatDetector", () => {
  const call = (name: string, args: string): RawToolCall => ({
    id: Math.random().toString(),
    name,
    arguments: args,
  });

  test("同一批调用连续出现 limit 次时报告", () => {
    const detector = createRepeatDetector(3);
    expect(detector.check([call("read", '{"p":"a"}')])).toBeUndefined();
    expect(detector.check([call("read", '{"p":"a"}')])).toBeUndefined();
    expect(detector.check([call("read", '{"p":"a"}')])).toEqual({ name: "read", times: 3 });
  });

  test("参数的空白和键的顺序不影响判断；id 不同也算同一个调用", () => {
    const detector = createRepeatDetector(2);
    detector.check([call("w", '{"a":1,"b":2}')]);
    expect(detector.check([call("w", '{ "b": 2, "a": 1 }')])).toEqual({ name: "w", times: 2 });
  });

  test("一批里的调用顺序不影响判断", () => {
    const detector = createRepeatDetector(2);
    detector.check([call("a", "{}"), call("b", "{}")]);
    expect(detector.check([call("b", "{}"), call("a", "{}")])).toEqual({ name: "b", times: 2 });
  });

  test("中间换了别的调用，或者没有调用，就重新计数", () => {
    const detector = createRepeatDetector(2);
    detector.check([call("a", "{}")]);
    detector.check([call("b", "{}")]);
    expect(detector.check([call("a", "{}")])).toBeUndefined();
    detector.check([]);
    expect(detector.check([call("a", "{}")])).toBeUndefined();
  });

  test("不是 JSON 的参数按原文比较", () => {
    const detector = createRepeatDetector(2);
    detector.check([call("a", "{bad")]);
    expect(detector.check([call("a", "{bad")])).toEqual({ name: "a", times: 2 });
    expect(detector.check([call("a", "{bad ")])).toBeUndefined();
  });

  test("reset 清空计数；默认 limit 是 3；limit 至少是 2", () => {
    const detector = createRepeatDetector();
    detector.check([call("a", "{}")]);
    detector.check([call("a", "{}")]);
    detector.reset();
    expect(detector.check([call("a", "{}")])).toBeUndefined();
    expect(() => createRepeatDetector(1)).toThrow(RangeError);
    expect(() => createRepeatDetector(2.5)).toThrow(RangeError);
  });
});

describe("repairHistory", () => {
  const ask = (...ids: string[]): Message => ({
    role: "assistant",
    content: null,
    tool_calls: ids.map((id) => ({
      id,
      type: "function",
      function: { name: "t", arguments: "{}" },
    })),
  });
  const result = (id: string): Message => ({
    role: "tool",
    tool_call_id: id,
    content: `结果 ${id}`,
  });
  const user: Message = { role: "user", content: "hi" };

  test("完整的记录原样返回", () => {
    const messages = [
      user,
      ask("a", "b"),
      result("b"),
      result("a"),
      { role: "assistant", content: "好" } as Message,
    ];
    expect(repairHistory(messages)).toEqual(messages);
  });

  test("没有结果的调用补上一条说明，放在这一组已有结果的后面", () => {
    expect(MISSING_RESULT).toBe("（没有结果：运行在这次调用完成之前就结束了）");
    expect(repairHistory([user, ask("a", "b", "c"), result("b")])).toEqual([
      user,
      ask("a", "b", "c"),
      result("b"),
      { role: "tool", tool_call_id: "a", content: MISSING_RESULT },
      { role: "tool", tool_call_id: "c", content: MISSING_RESULT },
    ]);
  });

  test("下一条消息开始之前补上，而不是补到最后", () => {
    expect(repairHistory([ask("a"), user], "取消了")).toEqual([
      ask("a"),
      { role: "tool", tool_call_id: "a", content: "取消了" },
      user,
    ]);
  });

  test("丢掉找不到调用的 tool 消息和重复的结果", () => {
    expect(
      repairHistory([user, result("x"), ask("a"), result("a"), result("a"), result("zzz")]),
    ).toEqual([user, ask("a"), result("a")]);
  });

  test("结果只能对应紧挨着的那一组调用", () => {
    expect(repairHistory([ask("a"), user, result("a")], "缺")).toEqual([
      ask("a"),
      { role: "tool", tool_call_id: "a", content: "缺" },
      user,
    ]);
  });

  test("不修改传入的数组", () => {
    const messages = [ask("a")];
    repairHistory(messages);
    expect(messages).toHaveLength(1);
  });
});

describe("shouldRetryStep", () => {
  test("流中途的错误（超时、断开、格式错误）可以整步重试", () => {
    expect(shouldRetryStep(new Error("响应流在完成之前就结束了"))).toBe(true);
    expect(shouldRetryStep(new DOMException("idle", "TimeoutError"))).toBe(true);
    expect(shouldRetryStep(new TypeError("fetch failed"))).toBe(true);
  });

  test("取消不重试", () => {
    expect(shouldRetryStep(new DOMException("aborted", "AbortError"))).toBe(false);
    const controller = new AbortController();
    controller.abort();
    expect(shouldRetryStep(new Error("随便什么"), controller.signal)).toBe(false);
  });

  test("ApiError 不重试：客户端已经重试过了", () => {
    expect(shouldRetryStep(new ApiError(503, "unavailable"))).toBe(false);
    expect(shouldRetryStep(new ApiError(400, "bad request"))).toBe(false);
  });
});
