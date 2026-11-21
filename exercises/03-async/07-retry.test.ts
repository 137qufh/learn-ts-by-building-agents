import { describe, expect, test } from "vitest";
import {
  fullJitter,
  parseRetryAfter,
  retry,
  type RetryInfo,
  type RetryOptions,
} from "./07-retry.ts";

const NOW = Date.parse("2026-01-01T00:00:00Z");

describe("parseRetryAfter", () => {
  test.each([
    ["2", 2000],
    ["0", 0],
    ["120", 120_000],
    [" 3 ", 3000],
    ["1.5", 1500],
    ["0.0004", 0],
  ])("秒数 %j → %i ms", (value, expected) => {
    expect(parseRetryAfter(value, NOW)).toBe(expected);
  });

  test("HTTP 日期：距离 now 的毫秒数", () => {
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:05 GMT", NOW)).toBe(5000);
  });

  test("已经过去的日期返回 0", () => {
    expect(parseRetryAfter("Wed, 31 Dec 2025 23:59:00 GMT", NOW)).toBe(0);
  });

  test.each([null, "", "   ", "-1", "soon", "1e3", "2 seconds", "Not a date GMT", "1.5.2"])(
    "%j → undefined",
    (value) => {
      expect(parseRetryAfter(value, NOW)).toBeUndefined();
    },
  );

  test("默认使用当前时间", () => {
    const inFiveSeconds = new Date(Date.now() + 5000).toUTCString();
    const result = parseRetryAfter(inFiveSeconds);
    expect(result).toBeGreaterThan(3000);
    expect(result).toBeLessThanOrEqual(5000);
  });
});

describe("fullJitter", () => {
  test("ms × random()，四舍五入", () => {
    expect(fullJitter(1000, () => 0)).toBe(0);
    expect(fullJitter(1000, () => 0.25)).toBe(250);
    expect(fullJitter(1000, () => 0.9999)).toBe(1000);
    expect(fullJitter(3, () => 0.5)).toBe(2);
  });

  test("默认使用 Math.random，结果在 [0, ms] 之间", () => {
    for (let i = 0; i < 100; i++) {
      const value = fullJitter(100);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

/** 测试用的工具：记录每次等待，但不真正等待；抖动固定为不变。 */
function harness(overrides: RetryOptions = {}) {
  const sleeps: number[] = [];
  const retries: RetryInfo[] = [];
  const options: RetryOptions = {
    jitter: (ms) => ms,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    onRetry: (info) => retries.push(info),
    ...overrides,
  };
  return { options, sleeps, retries };
}

/** 前 n 次失败，之后成功。 */
function flaky<T>(failures: unknown[], value: T) {
  const attempts: number[] = [];
  const fn = async (attempt: number): Promise<T> => {
    attempts.push(attempt);
    const failure = failures[attempt - 1];
    if (failure !== undefined) {
      throw failure;
    }
    return value;
  };
  return { fn, attempts };
}

describe("retry", () => {
  test("第一次就成功：不等待", async () => {
    const { options, sleeps } = harness();
    await expect(retry(async () => "ok", options)).resolves.toBe("ok");
    expect(sleeps).toEqual([]);
  });

  test("失败后按退避时间等待，再重试", async () => {
    const { options, sleeps, retries } = harness({ baseMs: 100 });
    const { fn, attempts } = flaky([new Error("a"), new Error("b")], "第三次成功");
    await expect(retry(fn, options)).resolves.toBe("第三次成功");
    expect(attempts).toEqual([1, 2, 3]);
    expect(sleeps).toEqual([100, 200]);
    expect(retries.map((r) => [r.attempt, r.delayMs, (r.error as Error).message])).toEqual([
      [1, 100, "a"],
      [2, 200, "b"],
    ]);
  });

  test("默认 retries 为 3：最多调用 4 次，然后抛出最后一次的错误", async () => {
    const { options, sleeps } = harness();
    const errors = [1, 2, 3, 4, 5].map((n) => new Error(`第 ${n} 次`));
    const { fn, attempts } = flaky(errors, "不会到这里");
    await expect(retry(fn, options)).rejects.toBe(errors[3]);
    expect(attempts).toEqual([1, 2, 3, 4]);
    expect(sleeps).toEqual([500, 1000, 2000]); // 默认 baseMs 500
  });

  test("retries 为 0：不重试", async () => {
    const { options } = harness({ retries: 0 });
    const { fn, attempts } = flaky([new Error("x")], "");
    await expect(retry(fn, options)).rejects.toThrow("x");
    expect(attempts).toEqual([1]);
  });

  test("退避不超过 maxMs", async () => {
    const { options, sleeps } = harness({ retries: 5, baseMs: 100, maxMs: 300 });
    const { fn } = flaky(
      [1, 2, 3, 4, 5].map(() => new Error("x")),
      "ok",
    );
    await retry(fn, options);
    expect(sleeps).toEqual([100, 200, 300, 300, 300]);
  });

  test("使用 jitter", async () => {
    const { options, sleeps } = harness({ baseMs: 100, jitter: (ms) => ms / 2 });
    const { fn } = flaky([new Error("x"), new Error("y")], "ok");
    await retry(fn, options);
    expect(sleeps).toEqual([50, 100]);
  });

  test("shouldRetry 返回 false：立刻抛出", async () => {
    const seen: [string, number][] = [];
    const { options } = harness({
      shouldRetry: (error, attempt) => {
        seen.push([(error as Error).message, attempt]);
        return (error as Error).message !== "401";
      },
    });
    const { fn, attempts } = flaky([new Error("503"), new Error("401")], "ok");
    await expect(retry(fn, options)).rejects.toThrow("401");
    expect(attempts).toEqual([1, 2]);
    expect(seen).toEqual([
      ["503", 1],
      ["401", 2],
    ]);
  });

  test("服务器指定了等待时间：用它，不加抖动", async () => {
    const rateLimited = Object.assign(new Error("429"), { retryAfterMs: 1234 });
    const { options, sleeps } = harness({
      jitter: () => 0,
      retryAfterMs: (error) => (error as { retryAfterMs?: number }).retryAfterMs,
    });
    const { fn } = flaky([rateLimited, new Error("500")], "ok");
    await retry(fn, options);
    expect(sleeps).toEqual([1234, 0]); // 第二次没有 retryAfterMs，用退避 + 抖动（这里抖动成了 0）
  });

  test("服务器要求的等待超过 maxMs：放弃", async () => {
    const rateLimited = Object.assign(new Error("429"), { retryAfterMs: 60_000 });
    const { options, sleeps } = harness({ maxMs: 10_000, retryAfterMs: () => 60_000 });
    const { fn, attempts } = flaky([rateLimited], "ok");
    await expect(retry(fn, options)).rejects.toBe(rateLimited);
    expect(attempts).toEqual([1]);
    expect(sleeps).toEqual([]);
  });

  test("fn 收到 signal", async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    await retry(
      async (_, signal) => {
        received = signal;
      },
      { signal: controller.signal },
    );
    expect(received).toBe(controller.signal);
  });

  test("开始前已经取消：不调用 fn", async () => {
    const { options } = harness({ signal: AbortSignal.abort("已取消") });
    const { fn, attempts } = flaky([], "ok");
    await expect(retry(fn, options)).rejects.toBe("已取消");
    expect(attempts).toEqual([]);
  });

  test("fn 失败时 signal 已被取消：以 reason 拒绝，不再重试", async () => {
    const controller = new AbortController();
    const { options, sleeps } = harness({ signal: controller.signal });
    await expect(
      retry(async () => {
        controller.abort("用户取消");
        throw new Error("请求被中断");
      }, options),
    ).rejects.toBe("用户取消");
    expect(sleeps).toEqual([]);
  });

  test("等待期间被取消：立刻停下（使用默认的 abortableSleep）", async () => {
    const controller = new AbortController();
    const { fn, attempts } = flaky([new Error("503")], "ok");
    setTimeout(() => controller.abort("用户取消"), 20);
    const start = performance.now();
    await expect(
      retry(fn, { baseMs: 10_000, jitter: (ms) => ms, signal: controller.signal }),
    ).rejects.toBe("用户取消");
    expect(performance.now() - start).toBeLessThan(1000);
    expect(attempts).toEqual([1]);
  });

  test("默认真的会等待", async () => {
    const { fn } = flaky([new Error("x")], "ok");
    const start = performance.now();
    await retry(fn, { baseMs: 30, jitter: (ms) => ms });
    expect(performance.now() - start).toBeGreaterThanOrEqual(25);
  });
});
