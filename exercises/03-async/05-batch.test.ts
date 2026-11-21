import { describe, expect, test } from "vitest";
import { allObject, createLimiter, mapWithConcurrency } from "./05-batch.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 记录同时在执行的任务数。 */
function concurrencyProbe() {
  let running = 0;
  let peak = 0;
  return {
    async track<T>(work: () => Promise<T>): Promise<T> {
      running++;
      peak = Math.max(peak, running);
      try {
        return await work();
      } finally {
        running--;
      }
    },
    get peak() {
      return peak;
    },
  };
}

describe("mapWithConcurrency", () => {
  test("结果顺序与输入相同，同时最多 limit 个", async () => {
    const probe = concurrencyProbe();
    const results = await mapWithConcurrency([30, 10, 20, 5, 15, 25], 2, (ms, i) =>
      probe.track(async () => {
        await sleep(ms);
        return `#${i}:${ms}`;
      }),
    );
    expect(results).toEqual(["#0:30", "#1:10", "#2:20", "#3:5", "#4:15", "#5:25"]);
    expect(probe.peak).toBe(2);
  });

  test("能用满并发：limit 足够大时全部同时执行", async () => {
    const probe = concurrencyProbe();
    await mapWithConcurrency([1, 2, 3, 4], 10, () => probe.track(() => sleep(10)));
    expect(probe.peak).toBe(4);
  });

  test("一个完成就立刻开始下一个，而不是一批一批地执行", async () => {
    const started: number[] = [];
    const start = performance.now();
    await mapWithConcurrency([60, 10, 10, 10], 2, async (ms, i) => {
      started.push(i);
      await sleep(ms);
    });
    // 按批执行需要 60 + 10 = 70ms 以上，工作者池大约 60ms 就能完成
    expect(performance.now() - start).toBeLessThan(68);
    expect(started).toEqual([0, 1, 2, 3]);
  });

  test("失败时拒绝，并且不再启动新任务", async () => {
    const started: number[] = [];
    const error = new Error("第 1 项失败");
    const promise = mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (_, i) => {
      started.push(i);
      await sleep(i === 0 ? 30 : 10); // 第 1 项先失败，这时第 0 项还在执行
      if (i === 1) {
        throw error;
      }
      return i;
    });
    await expect(promise).rejects.toBe(error);
    await sleep(40); // 等一等，确认之后也没有新任务开始
    expect(started).toEqual([0, 1]);
  });

  test("空数组返回空数组", async () => {
    await expect(mapWithConcurrency([], 3, async () => 1)).resolves.toEqual([]);
  });

  test.each([0, -1, 1.5, Number.NaN])("limit 为 %s 时报 RangeError", async (limit) => {
    await expect(async () => mapWithConcurrency([1], limit, async () => 1)).rejects.toThrow(
      RangeError,
    );
  });
});

describe("createLimiter", () => {
  test("同时最多 limit 个，结果与任务一致", async () => {
    const limiter = createLimiter(2);
    const probe = concurrencyProbe();
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        limiter.run(() => probe.track(() => sleep(10).then(() => n * 10))),
      ),
    );
    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(probe.peak).toBe(2);
  });

  test("active 和 pending 反映当前状态", async () => {
    const limiter = createLimiter(1);
    expect([limiter.active, limiter.pending]).toEqual([0, 0]);
    const a = limiter.run(() => sleep(20));
    const b = limiter.run(() => sleep(20));
    expect([limiter.active, limiter.pending]).toEqual([1, 1]);
    await a;
    await b;
    expect([limiter.active, limiter.pending]).toEqual([0, 0]);
  });

  test("按提交顺序开始执行", async () => {
    const limiter = createLimiter(1);
    const order: string[] = [];
    await Promise.all(
      ["a", "b", "c", "d"].map((name) =>
        limiter.run(async () => {
          order.push(name);
          await sleep(1);
        }),
      ),
    );
    expect(order).toEqual(["a", "b", "c", "d"]);
  });

  test("失败的任务也会释放名额，错误原样传给调用方", async () => {
    const limiter = createLimiter(1);
    const error = new Error("任务失败");
    const failing = limiter.run(() => sleep(5).then(() => Promise.reject(error)));
    const next = limiter.run(async () => "后面的任务照常执行");
    await expect(failing).rejects.toBe(error);
    await expect(next).resolves.toBe("后面的任务照常执行");
  });

  test("任务同步抛出时，变成被拒绝的 Promise，并释放名额", async () => {
    const limiter = createLimiter(1);
    const failing = limiter.run(() => {
      throw new Error("同步抛出");
    });
    expect(failing).toBeInstanceOf(Promise);
    await expect(failing).rejects.toThrow("同步抛出");
    await expect(limiter.run(async () => "ok")).resolves.toBe("ok");
  });

  test("名额交接时不会被新提交的任务抢走", async () => {
    const limiter = createLimiter(1);
    const probe = concurrencyProbe();
    const order: string[] = [];
    const task = (name: string) => () =>
      probe.track(async () => {
        order.push(name);
        await sleep(5);
      });

    const { promise: aDone, resolve: finishA } = Promise.withResolvers<void>();
    const a = limiter.run(() => aDone);
    const b = limiter.run(task("b")); // 排队
    // a 完成的同一时刻提交 c：这时名额刚刚释放，应该交给排在前面的 b，c 继续排队
    const c = aDone.then(() => limiter.run(task("c")));
    finishA();
    await Promise.all([a, b, c]);
    expect(order).toEqual(["b", "c"]);
    expect(probe.peak).toBe(1);
  });

  test.each([0, 2.5])("limit 为 %s 时报 RangeError", (limit) => {
    expect(() => createLimiter(limit)).toThrow(RangeError);
  });
});

describe("allObject", () => {
  test("等待所有的值", async () => {
    const result = await allObject({
      profile: sleep(10).then(() => ({ name: "Matt" })),
      models: Promise.resolve(["gpt-5"]),
      count: 3,
    });
    expect(result).toEqual({ profile: { name: "Matt" }, models: ["gpt-5"], count: 3 });
  });

  test("并发等待，而不是逐个等待", async () => {
    const start = performance.now();
    await allObject({ a: sleep(40), b: sleep(40), c: sleep(40) });
    expect(performance.now() - start).toBeLessThan(75);
  });

  test("任何一个拒绝，整体拒绝", async () => {
    const error = new Error("模型列表加载失败");
    await expect(allObject({ a: Promise.resolve(1), b: Promise.reject(error) })).rejects.toBe(
      error,
    );
  });

  test("空对象", async () => {
    await expect(allObject({})).resolves.toEqual({});
  });
});
