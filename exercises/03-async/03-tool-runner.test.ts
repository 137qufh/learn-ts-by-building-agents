import { describe, expect, test } from "vitest";
import {
  firstSuccessful,
  runConcurrently,
  runSequentially,
  timed,
  type Executor,
  type ToolCall,
} from "./03-tool-runner.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const calls: ToolCall[] = [
  { id: "call_1", name: "search", args: { query: "ts" } },
  { id: "call_2", name: "fail", args: {} },
  { id: "call_3", name: "read_file", args: { path: "a.txt" } },
];

/** 一个记录执行情况的假执行器：同时在执行的数量、开始顺序。 */
function trackingExecutor(delays: Record<string, number> = {}) {
  const started: string[] = [];
  let running = 0;
  let maxRunning = 0;
  const execute: Executor = async (call) => {
    started.push(call.id);
    running++;
    maxRunning = Math.max(maxRunning, running);
    try {
      await sleep(delays[call.id] ?? 10);
      if (call.name === "fail") {
        throw new Error("工具崩溃了");
      }
      if (call.name === "throw-string") {
        throw "不是 Error";
      }
      return `${call.name} 的结果`;
    } finally {
      running--;
    }
  };
  return {
    execute,
    started,
    get maxRunning() {
      return maxRunning;
    },
  };
}

const expected = [
  { id: "call_1", ok: true, output: "search 的结果" },
  { id: "call_2", ok: false, error: "工具崩溃了" },
  { id: "call_3", ok: true, output: "read_file 的结果" },
];

describe("runSequentially", () => {
  test("按顺序返回结果，失败被记录而不是抛出", async () => {
    const tracker = trackingExecutor();
    await expect(runSequentially(calls, tracker.execute)).resolves.toEqual(expected);
  });

  test("同一时刻只执行一个", async () => {
    const tracker = trackingExecutor();
    await runSequentially(calls, tracker.execute);
    expect(tracker.maxRunning).toBe(1);
    expect(tracker.started).toEqual(["call_1", "call_2", "call_3"]);
  });

  test("不是 Error 的异常用 String() 转换", async () => {
    const tracker = trackingExecutor();
    const results = await runSequentially(
      [{ id: "x", name: "throw-string", args: {} }],
      tracker.execute,
    );
    expect(results).toEqual([{ id: "x", ok: false, error: "不是 Error" }]);
  });

  test("执行器同步抛出也被记录", async () => {
    const execute: Executor = () => {
      throw new Error("同步抛出");
    };
    await expect(runSequentially(calls.slice(0, 1), execute)).resolves.toEqual([
      { id: "call_1", ok: false, error: "同步抛出" },
    ]);
  });

  test("没有调用时返回空数组", async () => {
    await expect(runSequentially([], trackingExecutor().execute)).resolves.toEqual([]);
  });
});

describe("runConcurrently", () => {
  test("结果和顺序与 runSequentially 相同", async () => {
    const tracker = trackingExecutor();
    await expect(runConcurrently(calls, tracker.execute)).resolves.toEqual(expected);
  });

  test("所有调用同时开始", async () => {
    const tracker = trackingExecutor();
    await runConcurrently(calls, tracker.execute);
    expect(tracker.maxRunning).toBe(3);
  });

  test("结果按调用的顺序排列，而不是完成的顺序", async () => {
    const tracker = trackingExecutor({ call_1: 40, call_3: 1 });
    const results = await runConcurrently(calls, tracker.execute);
    expect(results.map((r) => r.id)).toEqual(["call_1", "call_2", "call_3"]);
  });

  test("总耗时约等于最慢的那个，而不是总和", async () => {
    const tracker = trackingExecutor({ call_1: 40, call_2: 40, call_3: 40 });
    const start = performance.now();
    await runConcurrently(calls, tracker.execute);
    expect(performance.now() - start).toBeLessThan(100);
  });
});

describe("firstSuccessful", () => {
  test("返回第一个成功的结果，后面的不再尝试", async () => {
    const tried: string[] = [];
    const result = await firstSuccessful([
      async () => {
        tried.push("a");
        throw new Error("a 不可用");
      },
      async () => {
        tried.push("b");
        return "b 的回答";
      },
      async () => {
        tried.push("c");
        return "c 的回答";
      },
    ]);
    expect(result).toBe("b 的回答");
    expect(tried).toEqual(["a", "b"]);
  });

  test("按顺序尝试，不会同时开始", async () => {
    const tracker = trackingExecutor();
    await firstSuccessful([
      () => tracker.execute({ id: "1", name: "fail", args: {} }),
      () => tracker.execute({ id: "2", name: "fail", args: {} }),
      () => tracker.execute({ id: "3", name: "ok", args: {} }),
    ]);
    expect(tracker.maxRunning).toBe(1);
  });

  test("全部失败时抛出 AggregateError，包含每个错误", async () => {
    const e1 = new Error("限流");
    const e2 = new Error("超时");
    const error: unknown = await firstSuccessful([
      () => Promise.reject(e1),
      () => Promise.reject(e2),
    ]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([e1, e2]);
    expect((error as AggregateError).message).toBe("全部失败");
  });

  test("空数组也抛出 AggregateError", async () => {
    const error: unknown = await firstSuccessful([]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([]);
  });
});

describe("timed", () => {
  test("返回结果和用假时钟测出的耗时", async () => {
    const times = [1000, 1250];
    const now = () => times.shift() ?? 0;
    await expect(timed(async () => "完成", now)).resolves.toEqual({ value: "完成", ms: 250 });
  });

  test("在 fn 完成之后才读取结束时间", async () => {
    let clock = 0;
    const result = await timed(
      async () => {
        await sleep(1);
        clock = 500;
        return 1;
      },
      () => clock,
    );
    expect(result.ms).toBe(500);
  });

  test("fn 失败时原样抛出", async () => {
    const error = new Error("失败");
    await expect(timed(() => Promise.reject(error))).rejects.toBe(error);
  });

  test("默认使用真实的时钟", async () => {
    const result = await timed(() => sleep(30).then(() => "ok"));
    expect(result.value).toBe("ok");
    expect(result.ms).toBeGreaterThanOrEqual(25);
  });
});
