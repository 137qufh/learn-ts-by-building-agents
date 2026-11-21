import { describe, expect, test } from "vitest";
import {
  createDeferred,
  fromCallback,
  orElse,
  promisify,
  sleep,
  type NodeCallback,
} from "./02-promises.ts";

describe("sleep", () => {
  test("返回 Promise<void>，并在大约 ms 毫秒后兑现", async () => {
    const start = performance.now();
    const result = await sleep(40);
    expect(result).toBeUndefined();
    expect(performance.now() - start).toBeGreaterThanOrEqual(35);
  });

  test("不会阻塞：两个 sleep 同时进行", async () => {
    const start = performance.now();
    await Promise.all([sleep(40), sleep(40)]);
    expect(performance.now() - start).toBeLessThan(75);
  });
});

describe("fromCallback", () => {
  test("回调成功时兑现", async () => {
    await expect(fromCallback<number>((cb) => setTimeout(() => cb(null, 42), 1))).resolves.toBe(42);
  });

  test("回调收到错误时拒绝", async () => {
    const error = new Error("磁盘已满");
    await expect(fromCallback<number>((cb) => cb(error))).rejects.toBe(error);
  });

  test("没有错误也没有结果时拒绝", async () => {
    await expect(fromCallback<number>((cb) => cb(null))).rejects.toThrow("回调没有返回结果");
  });

  test("结果可以是 0、空字符串等假值", async () => {
    await expect(fromCallback<number>((cb) => cb(null, 0))).resolves.toBe(0);
    await expect(fromCallback<string>((cb) => cb(null, ""))).resolves.toBe("");
  });

  test("start 同步抛出时拒绝，而不是直接抛出", async () => {
    const promise = fromCallback<number>(() => {
      throw new Error("参数不对");
    });
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).rejects.toThrow("参数不对");
  });

  test("回调被调用多次时，只有第一次有效", async () => {
    await expect(
      fromCallback<number>((cb) => {
        cb(null, 1);
        cb(null, 2);
        cb(new Error("太晚了"));
      }),
    ).resolves.toBe(1);
  });
});

describe("promisify", () => {
  function legacyAdd(a: number, b: number, cb: NodeCallback<number>): void {
    setTimeout(() => (Number.isFinite(a + b) ? cb(null, a + b) : cb(new Error("不是有限数"))), 1);
  }

  test("转换后的函数返回 Promise", async () => {
    const add = promisify(legacyAdd);
    await expect(add(1, 2)).resolves.toBe(3);
  });

  test("错误变成拒绝", async () => {
    const add = promisify(legacyAdd);
    await expect(add(Infinity, 1)).rejects.toThrow("不是有限数");
  });

  test("参数原样传给原函数", async () => {
    const calls: unknown[][] = [];
    const fn = promisify((a: string, b: boolean, cb: NodeCallback<string>) => {
      calls.push([a, b]);
      cb(null, "ok");
    });
    await fn("x", true);
    expect(calls).toEqual([["x", true]]);
  });
});

describe("createDeferred", () => {
  test("从外部兑现", async () => {
    const deferred = createDeferred<string>();
    expect(deferred.state).toBe("pending");
    setTimeout(() => deferred.resolve("完成"), 1);
    await expect(deferred.promise).resolves.toBe("完成");
    expect(deferred.state).toBe("fulfilled");
  });

  test("从外部拒绝", async () => {
    const deferred = createDeferred<string>();
    deferred.reject(new Error("取消了"));
    expect(deferred.state).toBe("rejected");
    await expect(deferred.promise).rejects.toThrow("取消了");
  });

  test("只有第一次 resolve / reject 有效，state 也不再变化", async () => {
    const deferred = createDeferred<number>();
    deferred.resolve(1);
    deferred.reject(new Error("忽略"));
    deferred.resolve(2);
    expect(deferred.state).toBe("fulfilled");
    await expect(deferred.promise).resolves.toBe(1);
  });

  test("不使用 Promise.withResolvers", () => {
    const original = Promise.withResolvers;
    Promise.withResolvers = () => {
      throw new Error("不允许使用 Promise.withResolvers");
    };
    try {
      expect(() => createDeferred()).not.toThrow();
    } finally {
      Promise.withResolvers = original;
    }
  });
});

describe("orElse", () => {
  test("primary 成功时不调用 fallback", async () => {
    let fallbackCalled = false;
    const result = await orElse(
      () => Promise.resolve("主力模型"),
      () => {
        fallbackCalled = true;
        return Promise.resolve("备用模型");
      },
    );
    expect(result).toBe("主力模型");
    expect(fallbackCalled).toBe(false);
  });

  test("primary 失败时用 fallback 的结果", async () => {
    await expect(
      orElse(
        () => Promise.reject(new Error("限流")),
        () => Promise.resolve("备用模型"),
      ),
    ).resolves.toBe("备用模型");
  });

  test("都失败时以 fallback 的错误拒绝", async () => {
    await expect(
      orElse(
        () => Promise.reject(new Error("限流")),
        () => Promise.reject(new Error("备用也挂了")),
      ),
    ).rejects.toThrow("备用也挂了");
  });

  test("fallback 要等 primary 失败后才调用", async () => {
    const order: string[] = [];
    await orElse(
      async () => {
        order.push("primary 开始");
        await sleepReal(5);
        order.push("primary 失败");
        throw new Error("x");
      },
      async () => {
        order.push("fallback 开始");
        return "ok";
      },
    );
    expect(order).toEqual(["primary 开始", "primary 失败", "fallback 开始"]);
  });
});

function sleepReal(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
