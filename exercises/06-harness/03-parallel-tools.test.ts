import type { RawToolCall } from "@learn-ts/agent-kit";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  CANCELLED_CONTENT,
  runToolCalls,
  timeoutContent,
  type ExecuteTool,
  type ToolRun,
} from "./03-parallel-tools.ts";

const calls = (...names: string[]): RawToolCall[] =>
  names.map((name, index) => ({ id: `c${index + 1}`, name, arguments: "{}" }));

/** 每个工具等待 ms 毫秒（按名字查表），然后返回 "名字 done"。记录并发数。 */
function sleepyTools(delays: Record<string, number>) {
  const log: string[] = [];
  let running = 0;
  let peak = 0;
  const signals: AbortSignal[] = [];
  const execute: ExecuteTool = (call, signal) => {
    signals.push(signal);
    log.push(`start ${call.name}`);
    running++;
    peak = Math.max(peak, running);
    return new Promise((resolve) => {
      setTimeout(() => {
        running--;
        log.push(`end ${call.name}`);
        resolve({ ok: true, content: `${call.name} done` });
      }, delays[call.name] ?? 0);
    });
  };
  return { execute, log, signals, peak: () => peak };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("runToolCalls", () => {
  test("结果按调用的顺序，不按完成的顺序；onResult 按完成的顺序", async () => {
    vi.useFakeTimers();
    const tools = sleepyTools({ slow: 30, fast: 10, mid: 20 });
    const finished: string[] = [];
    const promise = runToolCalls(calls("slow", "fast", "mid"), tools.execute, {
      onResult: (run) => finished.push(run.name),
    });
    await vi.advanceTimersByTimeAsync(30);
    const results = await promise;
    expect(results.map((r) => r.name)).toEqual(["slow", "fast", "mid"]);
    expect(results.map((r) => r.id)).toEqual(["c1", "c2", "c3"]);
    expect(finished).toEqual(["fast", "mid", "slow"]);
    expect(results[0]).toMatchObject({ ok: true, status: "ok", content: "slow done" });
  });

  test("默认全部同时开始", async () => {
    vi.useFakeTimers();
    const tools = sleepyTools({ a: 10, b: 10, c: 10 });
    const promise = runToolCalls(calls("a", "b", "c"), tools.execute);
    await vi.advanceTimersByTimeAsync(10);
    await promise;
    expect(tools.peak()).toBe(3);
  });

  test("concurrency 限制同时执行的数量，按顺序开始", async () => {
    vi.useFakeTimers();
    const tools = sleepyTools({ a: 35, b: 10, c: 10, d: 10 });
    const promise = runToolCalls(calls("a", "b", "c", "d"), tools.execute, { concurrency: 2 });
    await vi.advanceTimersByTimeAsync(35);
    await promise;
    expect(tools.peak()).toBe(2);
    expect(tools.log).toEqual([
      "start a",
      "start b",
      "end b",
      "start c",
      "end c",
      "start d",
      "end d",
      "end a",
    ]);
  });

  test("durationMs 用注入的 now 计算", async () => {
    let clock = 100;
    const execute: ExecuteTool = async () => {
      clock += 42;
      return { ok: true, content: "x" };
    };
    const [run] = await runToolCalls(calls("a"), execute, { now: () => clock });
    expect(run?.durationMs).toBe(42);
  });

  test("工具报告失败（ok: false）：status 是 error，内容原样保留", async () => {
    const execute: ExecuteTool = async () => ({ ok: false, content: "参数不对" });
    const [run] = await runToolCalls(calls("a"), execute);
    expect(run).toMatchObject({ ok: false, status: "error", content: "参数不对" });
  });

  test("工具抛出（或同步抛出）：变成 error 结果，不影响其他工具，整体不拒绝", async () => {
    const execute: ExecuteTool = (call) => {
      if (call.name === "sync") throw new Error("同步炸了");
      if (call.name === "async") return Promise.reject(new Error("异步炸了"));
      if (call.name === "string") return Promise.reject("不是 Error");
      return Promise.resolve({ ok: true, content: "fine" });
    };
    const results = await runToolCalls(calls("sync", "async", "string", "good"), execute);
    expect(results.map((r) => [r.status, r.content])).toEqual([
      ["error", "工具执行失败：同步炸了"],
      ["error", "工具执行失败：异步炸了"],
      ["error", "工具执行失败：不是 Error"],
      ["ok", "fine"],
    ]);
  });

  test("超时：这个调用得到 timeout 结果，它的 signal 被取消，其他调用不受影响", async () => {
    vi.useFakeTimers();
    const tools = sleepyTools({ hang: 10_000, quick: 10 });
    const promise = runToolCalls(calls("hang", "quick"), tools.execute, { timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    const results = await promise; // 不等那个不听话的工具真的结束
    expect(results[0]).toEqual({
      id: "c1",
      name: "hang",
      ok: false,
      status: "timeout",
      content: timeoutContent("hang", 100),
      durationMs: expect.any(Number) as number,
    });
    expect(timeoutContent("hang", 100)).toBe("工具 hang 超过 100ms 没有完成，已停止");
    expect(results[1]?.status).toBe("ok");
    expect(tools.signals[0]?.aborted).toBe(true);
    expect((tools.signals[0]?.reason as Error).name).toBe("TimeoutError");
    expect(tools.signals[1]?.aborted).toBe(false);
  });

  test("超时让出名额：排队的工具不用等那个不听话的工具", async () => {
    vi.useFakeTimers();
    const tools = sleepyTools({ hang: 10_000, next: 10 });
    const promise = runToolCalls(calls("hang", "next"), tools.execute, {
      concurrency: 1,
      timeoutMs: 50,
    });
    await vi.advanceTimersByTimeAsync(60);
    const results = await promise;
    expect(results.map((r) => r.status)).toEqual(["timeout", "ok"]);
  });

  test("完成后不留下定时器", async () => {
    vi.useFakeTimers();
    const tools = sleepyTools({ a: 10 });
    const promise = runToolCalls(calls("a"), tools.execute, { timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(10);
    await promise;
    expect(vi.getTimerCount()).toBe(0);
  });

  test("取消：没完成的立刻得到 cancelled 结果，没开始的不再执行", async () => {
    vi.useFakeTimers();
    const tools = sleepyTools({ a: 10, b: 1000, c: 1000, d: 10 });
    const controller = new AbortController();
    const finished: ToolRun[] = [];
    const promise = runToolCalls(calls("a", "b", "c", "d"), tools.execute, {
      concurrency: 2,
      signal: controller.signal,
      onResult: (run) => finished.push(run),
    });
    await vi.advanceTimersByTimeAsync(20); // a 完成，c 开始
    controller.abort();
    const results = await promise;
    expect(results.map((r) => r.status)).toEqual(["ok", "cancelled", "cancelled", "cancelled"]);
    expect(results[1]).toMatchObject({ ok: false, content: CANCELLED_CONTENT });
    expect(results[3]?.durationMs).toBe(0); // 没开始过
    expect(tools.log).not.toContain("start d");
    expect(tools.signals.every((s) => s.aborted)).toBe(true);
    expect(finished).toHaveLength(4);
  });

  test("工具因为取消而拒绝，也算 cancelled", async () => {
    const controller = new AbortController();
    const execute: ExecuteTool = (_call, signal) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason as Error)),
      );
    const promise = runToolCalls(calls("a"), execute, { signal: controller.signal });
    controller.abort();
    expect((await promise)[0]?.status).toBe("cancelled");
  });

  test("一开始就取消了：一个都不执行", async () => {
    const controller = new AbortController();
    controller.abort();
    const execute = vi.fn<ExecuteTool>();
    const results = await runToolCalls(calls("a", "b"), execute, { signal: controller.signal });
    expect(results.map((r) => r.status)).toEqual(["cancelled", "cancelled"]);
    expect(execute).not.toHaveBeenCalled();
  });

  test("没有调用：返回空数组", async () => {
    expect(await runToolCalls([], () => Promise.reject(new Error("不该调用")))).toEqual([]);
  });

  test("concurrency 不合法：拒绝 RangeError", async () => {
    const execute: ExecuteTool = async () => ({ ok: true, content: "" });
    await expect(runToolCalls(calls("a"), execute, { concurrency: 0 })).rejects.toThrow(RangeError);
    await expect(runToolCalls(calls("a"), execute, { concurrency: 1.5 })).rejects.toThrow(
      RangeError,
    );
  });
});
