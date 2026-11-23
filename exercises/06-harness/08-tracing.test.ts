import { describe, expect, test, vi } from "vitest";
import {
  createRecordingTracer,
  isSecretKey,
  noopTracer,
  redact,
  toJsonLine,
  traced,
} from "./08-tracing.ts";

function fakeClock() {
  let time = 0;
  return { now: () => time, advance: (ms: number) => (time += ms) };
}

describe("createRecordingTracer", () => {
  test("记录 span：名字、开始和结束时间、属性、状态", () => {
    const clock = fakeClock();
    const tracer = createRecordingTracer({ now: clock.now });
    const span = tracer.start("model", { attributes: { step: 1 } });
    clock.advance(30);
    span.set("finishReason", "stop");
    span.end();
    expect(tracer.spans).toEqual([
      {
        id: 1,
        name: "model",
        start: 0,
        end: 30,
        status: "ok",
        attributes: { step: 1, finishReason: "stop" },
      },
    ]);
  });

  test("属性是副本：之后修改传进去的对象不影响记录", () => {
    const tracer = createRecordingTracer();
    const attributes = { a: 1 };
    tracer.start("x", { attributes });
    attributes.a = 2;
    expect(tracer.spans[0]?.attributes).toEqual({ a: 1 });
  });

  test("parent 记录为 parentId；id 从 1 开始递增", () => {
    const tracer = createRecordingTracer();
    const run = tracer.start("run");
    const step = tracer.start("step", { parent: run });
    expect(step.id).toBe(2);
    expect(tracer.spans[1]?.parentId).toBe(1);
    expect("parentId" in tracer.spans[0]!).toBe(false);
  });

  test("fail 记录错误信息；只结束一次，之后的 end/fail 被忽略", () => {
    const clock = fakeClock();
    const onEnd = vi.fn();
    const tracer = createRecordingTracer({ now: clock.now, onEnd });
    const span = tracer.start("tool");
    clock.advance(5);
    span.fail(new Error("超时"));
    clock.advance(5);
    span.end();
    span.fail("again");
    expect(tracer.spans[0]).toMatchObject({ status: "error", error: "超时", end: 5 });
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith(tracer.spans[0]);
  });

  test("fail 的参数不是 Error 时用 String()", () => {
    const tracer = createRecordingTracer();
    tracer.start("x").fail(42);
    expect(tracer.spans[0]?.error).toBe("42");
  });

  test("没结束的 span 状态是 running，没有 end", () => {
    const tracer = createRecordingTracer();
    tracer.start("x");
    expect(tracer.spans[0]?.status).toBe("running");
    expect(tracer.spans[0]?.end).toBeUndefined();
  });

  test("tree：按父子关系缩进，子 span 按开始的顺序，时间四舍五入", () => {
    const clock = fakeClock();
    const tracer = createRecordingTracer({ now: clock.now });
    const run = tracer.start("agent.run");
    const step = tracer.start("step", { parent: run });
    const model = tracer.start("model", { parent: step });
    clock.advance(10.4);
    model.end();
    const tool = tracer.start("tool read_file", { parent: step });
    clock.advance(2.6);
    tool.fail(new Error("没有这个文件"));
    step.end();
    tracer.start("step", { parent: run });
    expect(tracer.tree()).toBe(
      [
        "agent.run （未结束）",
        "  step 13ms",
        "    model 10ms",
        "    tool read_file 3ms ✗ 没有这个文件",
        "  step （未结束）",
      ].join("\n"),
    );
  });

  test("noopTracer 的 span 什么都不记录；把它作为 parent 也没关系", () => {
    const span = noopTracer.start("x", { attributes: { a: 1 } });
    span.set("b", 2);
    span.end();
    span.fail(new Error("x"));
    const tracer = createRecordingTracer();
    tracer.start("child", { parent: span });
    expect("parentId" in tracer.spans[0]!).toBe(false);
  });
});

describe("traced", () => {
  test("成功时结束 span 并返回结果", async () => {
    const tracer = createRecordingTracer();
    const value = await traced(tracer, "work", { attributes: { n: 1 } }, async (span) => {
      span.set("done", true);
      return 42;
    });
    expect(value).toBe(42);
    expect(tracer.spans[0]).toMatchObject({ status: "ok", attributes: { n: 1, done: true } });
  });

  test("失败时记录错误，并把原来的错误抛出去", async () => {
    const tracer = createRecordingTracer();
    const boom = new Error("boom");
    await expect(traced(tracer, "work", {}, () => Promise.reject(boom))).rejects.toBe(boom);
    expect(tracer.spans[0]).toMatchObject({ status: "error", error: "boom" });
  });
});

describe("redact", () => {
  test("isSecretKey：结尾是 apikey、token、secret、password、authorization、cookie（不分大小写，忽略 - 和 _）", () => {
    for (const key of [
      "apiKey",
      "api_key",
      "OPENAI_API_KEY",
      "accessToken",
      "client-secret",
      "Authorization",
      "password",
      "Cookie",
    ]) {
      expect(isSecretKey(key), key).toBe(true);
    }
    for (const key of ["inputTokens", "maxTokens", "tokenCount", "model", "secretary_name"]) {
      expect(isSecretKey(key), key).toBe(false);
    }
  });

  test("深层替换，不修改原对象", () => {
    const value = {
      model: "m",
      headers: { Authorization: "Bearer x" },
      list: [{ apiKey: "k", n: 1 }],
      usage: { inputTokens: 3 },
    };
    expect(redact(value)).toEqual({
      model: "m",
      headers: { Authorization: "[REDACTED]" },
      list: [{ apiKey: "[REDACTED]", n: 1 }],
      usage: { inputTokens: 3 },
    });
    expect(value.headers.Authorization).toBe("Bearer x");
    expect(redact("plain")).toBe("plain");
    expect(redact(null)).toBe(null);
  });

  test("可以传入自己的判断函数", () => {
    expect(redact({ a: 1, b: 2 }, (key) => key === "b")).toEqual({ a: 1, b: "[REDACTED]" });
  });

  test("toJsonLine：一行 JSON，敏感属性已经替换", () => {
    const tracer = createRecordingTracer({ now: () => 0 });
    tracer.start("request", { attributes: { apiKey: "sk-123", model: "m" } }).end();
    const line = toJsonLine(tracer.spans[0]!);
    expect(line).not.toContain("\n");
    expect(line).not.toContain("sk-123");
    expect(JSON.parse(line)).toMatchObject({
      name: "request",
      attributes: { apiKey: "[REDACTED]", model: "m" },
    });
  });
});
