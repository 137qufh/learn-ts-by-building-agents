import { describe, expect, test } from "vitest";
import { createTracer, percentile } from "./08-profiling.ts";

describe("percentile", () => {
  const values = [40, 15, 50, 35, 20];

  test.each([
    [0, 15],
    [20, 15],
    [21, 20],
    [50, 35],
    [95, 50],
    [100, 50],
  ])("p%i = %i", (p, expected) => {
    expect(percentile(values, p)).toBe(expected);
  });

  test("不修改传入的数组", () => {
    const input = [3, 1, 2];
    percentile(input, 50);
    expect(input).toEqual([3, 1, 2]);
  });

  test("按数值排序，而不是按字符串", () => {
    expect(percentile([100, 9, 20], 50)).toBe(20);
  });

  test("一个值", () => {
    expect(percentile([7], 0)).toBe(7);
    expect(percentile([7], 99)).toBe(7);
  });

  test("非法输入", () => {
    expect(() => percentile([], 50)).toThrow(RangeError);
    expect(() => percentile([1], -1)).toThrow(RangeError);
    expect(() => percentile([1], 101)).toThrow(RangeError);
    expect(() => percentile([1], Number.NaN)).toThrow(RangeError);
  });
});

/** 一个手动拨动的时钟 */
function manualClock(): { now: () => number; tick: (ms: number) => void } {
  let time = 1000;
  return { now: () => time, tick: (ms) => (time += ms) };
}

describe("createTracer", () => {
  test("同步函数：返回结果并记录 span", async () => {
    const clock = manualClock();
    const tracer = createTracer(clock.now);
    const result = await tracer.span("parse", () => {
      clock.tick(5);
      return 42;
    });
    expect(result).toBe(42);
    expect(tracer.spans()).toEqual([{ name: "parse", start: 1000, ms: 5, ok: true }]);
  });

  test("异步函数：计时到 Promise 完成为止", async () => {
    const clock = manualClock();
    const tracer = createTracer(clock.now);
    const result = await tracer.span("llm", async () => {
      await Promise.resolve();
      clock.tick(300);
      return "回复";
    });
    expect(result).toBe("回复");
    expect(tracer.spans()).toEqual([{ name: "llm", start: 1000, ms: 300, ok: true }]);
  });

  test("抛错也记录，并把错误原样抛出", async () => {
    const clock = manualClock();
    const tracer = createTracer(clock.now);
    const error = new Error("超时");
    await expect(
      tracer.span("tool", async () => {
        clock.tick(50);
        throw error;
      }),
    ).rejects.toBe(error);
    await expect(
      tracer.span("sync-tool", () => {
        clock.tick(1);
        throw error;
      }),
    ).rejects.toBe(error);
    expect(tracer.spans()).toEqual([
      { name: "tool", start: 1000, ms: 50, ok: false },
      { name: "sync-tool", start: 1050, ms: 1, ok: false },
    ]);
  });

  test("嵌套的 span：按结束的先后顺序", async () => {
    const clock = manualClock();
    const tracer = createTracer(clock.now);
    await tracer.span("turn", async () => {
      clock.tick(1);
      await tracer.span("llm", () => clock.tick(10));
      await tracer.span("tool", () => clock.tick(4));
    });
    expect(tracer.spans().map((s) => [s.name, s.ms])).toEqual([
      ["llm", 10],
      ["tool", 4],
      ["turn", 15],
    ]);
  });

  test("spans() 返回副本", async () => {
    const tracer = createTracer(manualClock().now);
    await tracer.span("a", () => 1);
    tracer.spans().pop();
    expect(tracer.spans()).toHaveLength(1);
  });

  test("summary：按名字汇总，按总耗时排序", async () => {
    const clock = manualClock();
    const tracer = createTracer(clock.now);
    for (const ms of [100, 300, 200]) {
      await tracer.span("llm", () => clock.tick(ms));
    }
    for (const ms of [5, 1, 9, 2]) {
      await tracer.span("tool:search", () => clock.tick(ms));
    }
    await tracer.span("tool:fetch", () => clock.tick(17));
    await tracer.span("tool:echo", () => clock.tick(17));

    expect(tracer.summary()).toEqual([
      { name: "llm", count: 3, totalMs: 600, p50: 200, p95: 300, maxMs: 300 },
      { name: "tool:echo", count: 1, totalMs: 17, p50: 17, p95: 17, maxMs: 17 },
      { name: "tool:fetch", count: 1, totalMs: 17, p50: 17, p95: 17, maxMs: 17 },
      { name: "tool:search", count: 4, totalMs: 17, p50: 2, p95: 9, maxMs: 9 },
    ]);
  });

  test("默认使用 performance.now()", async () => {
    const tracer = createTracer();
    await tracer.span("sleep", () => new Promise((resolve) => setTimeout(resolve, 20)));
    const [span] = tracer.spans();
    expect(span?.ms).toBeGreaterThanOrEqual(15);
    expect(span?.ms).toBeLessThan(1000);
  });
});
