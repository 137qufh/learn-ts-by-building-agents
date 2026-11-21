import { describe, expect, test, vi } from "vitest";
import {
  abortableSleep,
  isAbortError,
  isTimeoutError,
  raceAbort,
  withTimeout,
} from "./06-abort.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("abortableSleep", () => {
  test("不传 signal 时正常等待", async () => {
    const start = performance.now();
    await abortableSleep(30);
    expect(performance.now() - start).toBeGreaterThanOrEqual(25);
  });

  test("取消时立刻以 reason 拒绝", async () => {
    const controller = new AbortController();
    const reason = new Error("用户取消");
    setTimeout(() => controller.abort(reason), 10);
    const start = performance.now();
    await expect(abortableSleep(1000, controller.signal)).rejects.toBe(reason);
    expect(performance.now() - start).toBeLessThan(200);
  });

  test("已经取消的 signal：立刻拒绝，不启动定时器", async () => {
    const spy = vi.spyOn(globalThis, "setTimeout");
    try {
      const controller = new AbortController();
      controller.abort("早就取消了");
      await expect(abortableSleep(1000, controller.signal)).rejects.toBe("早就取消了");
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test("取消时清除定时器", async () => {
    const spy = vi.spyOn(globalThis, "clearTimeout");
    try {
      const controller = new AbortController();
      const promise = abortableSleep(1000, controller.signal);
      controller.abort();
      await promise.catch(() => {});
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test("正常结束时移除监听", async () => {
    const { signal } = new AbortController();
    const add = vi.spyOn(signal, "addEventListener");
    const remove = vi.spyOn(signal, "removeEventListener");
    await abortableSleep(5, signal);
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0]?.[1]).toBe(add.mock.calls[0]?.[1]); // 移除的是同一个函数
  });
});

describe("raceAbort", () => {
  test("不传 signal 时结果与 promise 相同", async () => {
    await expect(raceAbort(Promise.resolve(1))).resolves.toBe(1);
    const error = new Error("x");
    await expect(raceAbort(Promise.reject(error))).rejects.toBe(error);
  });

  test("promise 先完成", async () => {
    const controller = new AbortController();
    await expect(
      raceAbort(
        sleep(5).then(() => "完成"),
        controller.signal,
      ),
    ).resolves.toBe("完成");
  });

  test("promise 先失败", async () => {
    const controller = new AbortController();
    const error = new Error("失败");
    await expect(
      raceAbort(
        sleep(5).then(() => Promise.reject(error)),
        controller.signal,
      ),
    ).rejects.toBe(error);
  });

  test("signal 先取消：不再等待", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort("放弃"), 5);
    const start = performance.now();
    await expect(raceAbort(sleep(500), controller.signal)).rejects.toBe("放弃");
    expect(performance.now() - start).toBeLessThan(200);
  });

  test("已经取消的 signal：立刻拒绝", async () => {
    await expect(raceAbort(sleep(500), AbortSignal.abort("已取消"))).rejects.toBe("已取消");
  });

  test("promise 先完成时移除监听", async () => {
    const { signal } = new AbortController();
    const add = vi.spyOn(signal, "addEventListener");
    const remove = vi.spyOn(signal, "removeEventListener");
    await raceAbort(sleep(1), signal);
    expect(remove).toHaveBeenCalledTimes(add.mock.calls.length);
    expect(remove.mock.calls[0]?.[1]).toBe(add.mock.calls[0]?.[1]);
  });
});

describe("withTimeout", () => {
  test("在时限内完成", async () => {
    await expect(withTimeout(async () => "完成", 100)).resolves.toBe("完成");
  });

  test("task 收到一个 AbortSignal", async () => {
    let received: unknown;
    await withTimeout(async (signal) => {
      received = signal;
    }, 100);
    expect(received).toBeInstanceOf(AbortSignal);
  });

  test("超时：task 的 signal 被取消，结果以 TimeoutError 拒绝", async () => {
    let taskSignal: AbortSignal | undefined;
    const error: unknown = await withTimeout((signal) => {
      taskSignal = signal;
      return abortableSleep(1000, signal);
    }, 20).catch((e: unknown) => e);
    expect(isTimeoutError(error)).toBe(true);
    expect(taskSignal?.aborted).toBe(true);
  });

  test("即使 task 不理会 signal，超时后也立刻拒绝", async () => {
    const start = performance.now();
    const error: unknown = await withTimeout(() => sleep(500), 20).catch((e: unknown) => e);
    expect(isTimeoutError(error)).toBe(true);
    expect(performance.now() - start).toBeLessThan(300);
  });

  test("外部 signal 取消时，以它的 reason 拒绝", async () => {
    const controller = new AbortController();
    const reason = new DOMException("用户按了 Ctrl+C", "AbortError");
    setTimeout(() => controller.abort(reason), 10);
    let taskSignal: AbortSignal | undefined;
    await expect(
      withTimeout(
        (signal) => {
          taskSignal = signal;
          return abortableSleep(1000, signal);
        },
        1000,
        { signal: controller.signal },
      ),
    ).rejects.toBe(reason);
    expect(taskSignal?.aborted).toBe(true);
  });

  test("task 自己的错误原样传出", async () => {
    const error = new Error("工具崩溃");
    await expect(withTimeout(() => Promise.reject(error), 100)).rejects.toBe(error);
  });

  test("task 同步抛出也变成拒绝", async () => {
    const promise = withTimeout(() => {
      throw new Error("同步");
    }, 100);
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).rejects.toThrow("同步");
  });
});

describe("isAbortError / isTimeoutError", () => {
  test("识别 AbortController 的默认原因", () => {
    const controller = new AbortController();
    controller.abort();
    expect(isAbortError(controller.signal.reason)).toBe(true);
    expect(isTimeoutError(controller.signal.reason)).toBe(false);
  });

  test("识别超时", async () => {
    const signal = AbortSignal.timeout(1);
    await sleep(10);
    expect(isTimeoutError(signal.reason)).toBe(true);
    expect(isAbortError(signal.reason)).toBe(false);
  });

  test("按 name 识别，不限于 DOMException", () => {
    const nodeStyle = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    expect(isAbortError(nodeStyle)).toBe(true);
  });

  test("其他值都不是", () => {
    expect(isAbortError(new Error("AbortError"))).toBe(false);
    expect(isAbortError({ name: "AbortError" })).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isTimeoutError(undefined)).toBe(false);
  });
});
