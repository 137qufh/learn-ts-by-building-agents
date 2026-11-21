import { describe, expect, test } from "vitest";
import { batch, collect, idleTimeout, mapAsync, take } from "./08-stream-tools.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 测试自己的收集函数，这样 collect 没写完时，其他测试也能独立运行。 */
async function drain<T>(source: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of source) {
    items.push(item);
  }
  return items;
}

/** 一个会记录自己状态的上游：拉取了几次、finally 有没有执行。 */
function tracked<T>(items: T[], delayMs = 0) {
  const state = { pulled: 0, closed: false, started: false };
  async function* generate(): AsyncGenerator<T> {
    state.started = true;
    try {
      for (const item of items) {
        if (delayMs > 0) {
          await sleep(delayMs);
        }
        state.pulled++;
        yield item;
      }
    } finally {
      state.closed = true;
    }
  }
  return { source: generate(), state };
}

/** 按给定的间隔依次产出值：gaps[i] 是产出第 i 个值之前等待的毫秒数。 */
async function* paced<T>(items: T[], gaps: number[], onClose?: () => void): AsyncGenerator<T> {
  try {
    for (const [i, item] of items.entries()) {
      await sleep(gaps[i] ?? 0);
      yield item;
    }
  } finally {
    onClose?.();
  }
}

describe("collect", () => {
  test("收集所有值", async () => {
    expect(await collect(tracked([1, 2, 3]).source)).toEqual([1, 2, 3]);
  });

  test("空的流得到空数组", async () => {
    expect(await collect(tracked([]).source)).toEqual([]);
  });

  test("接受任何异步可迭代对象，不只是生成器", async () => {
    const iterable: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        let i = 0;
        return {
          next: async () =>
            i < 2 ? { done: false, value: `x${i++}` } : { done: true, value: undefined },
        };
      },
    };
    expect(await collect(iterable)).toEqual(["x0", "x1"]);
  });

  test("上游的异常会传出来", async () => {
    async function* broken(): AsyncGenerator<number> {
      yield 1;
      throw new Error("连接断开");
    }
    await expect(collect(broken())).rejects.toThrow("连接断开");
  });
});

describe("take", () => {
  test("只取前几个", async () => {
    expect(await drain(take(tracked([1, 2, 3, 4, 5]).source, 3))).toEqual([1, 2, 3]);
  });

  test("取够之后不再多拉取，并且上游的 finally 会执行", async () => {
    const { source, state } = tracked([1, 2, 3, 4, 5]);
    await drain(take(source, 2));
    expect(state.pulled).toBe(2);
    expect(state.closed).toBe(true);
  });

  test("上游不够时全部产出", async () => {
    expect(await drain(take(tracked([1, 2]).source, 10))).toEqual([1, 2]);
  });

  test("count <= 0：什么也不产生，也不从上游读取", async () => {
    const { source, state } = tracked([1, 2, 3]);
    expect(await drain(take(source, 0))).toEqual([]);
    expect(state.started).toBe(false);
    expect(await drain(take(tracked([1]).source, -1))).toEqual([]);
  });

  test("可以处理无限的流", async () => {
    async function* forever(): AsyncGenerator<number> {
      for (let i = 0; ; i++) {
        yield i;
      }
    }
    expect(await drain(take(forever(), 4))).toEqual([0, 1, 2, 3]);
  });

  test("消费者提前退出时，上游也会结束", async () => {
    const { source, state } = tracked([1, 2, 3, 4, 5]);
    for await (const item of take(source, 4)) {
      if (item === 2) {
        break;
      }
    }
    expect(state.closed).toBe(true);
    expect(state.pulled).toBe(2);
  });
});

describe("mapAsync", () => {
  test("对每个值调用 fn，第二个参数是下标", async () => {
    const result = await drain(mapAsync(tracked(["a", "b", "c"]).source, (s, i) => `${i}:${s}`));
    expect(result).toEqual(["0:a", "1:b", "2:c"]);
  });

  test("fn 返回 Promise 时产出兑现的值", async () => {
    const result = await drain(
      mapAsync(tracked([1, 2, 3]).source, async (n) => {
        await sleep(1);
        return n * 10;
      }),
    );
    expect(result).toEqual([10, 20, 30]);
  });

  test("一个一个地处理，不会并发调用 fn", async () => {
    let active = 0;
    let maxActive = 0;
    await drain(
      mapAsync(tracked([1, 2, 3, 4]).source, async (n) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await sleep(2);
        active--;
        return n;
      }),
    );
    expect(maxActive).toBe(1);
  });

  test("fn 抛出的异常会传出来，上游会被关闭", async () => {
    const { source, state } = tracked([1, 2, 3]);
    const mapped = mapAsync(source, (n) => {
      if (n === 2) {
        throw new Error("处理失败");
      }
      return n;
    });
    await expect(drain(mapped)).rejects.toThrow("处理失败");
    expect(state.closed).toBe(true);
  });
});

describe("batch", () => {
  test("每 size 个打包，最后不足的也产出", async () => {
    const result = await drain(batch(tracked([1, 2, 3, 4, 5]).source, 2));
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  test("刚好整除时，最后没有空数组", async () => {
    const result = await drain(batch(tracked([1, 2, 3, 4]).source, 2));
    expect(result).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  test("空的流什么也不产生", async () => {
    expect(await drain(batch(tracked([]).source, 3))).toEqual([]);
  });

  test("已经产出的数组之后不会被修改", async () => {
    const seen: number[][] = [];
    for await (const group of batch(tracked([1, 2, 3, 4]).source, 2)) {
      seen.push(group);
    }
    expect(seen[0]).toEqual([1, 2]);
    expect(seen[0]).not.toBe(seen[1]);
  });

  test("满一批就立刻产出，不等整个流结束", async () => {
    const { source, state } = tracked([1, 2, 3, 4, 5, 6]);
    for await (const group of batch(source, 2)) {
      expect(group).toEqual([1, 2]);
      expect(state.pulled).toBe(2);
      break;
    }
  });

  test.each([0, -1, 1.5, Number.NaN])("size 为 %s 时抛出 RangeError", async (size) => {
    await expect(drain(batch(tracked([1]).source, size))).rejects.toThrow(RangeError);
  });
});

describe("idleTimeout", () => {
  test("间隔都不超时：原样产出所有值", async () => {
    const result = await drain(idleTimeout(paced(["a", "b", "c"], [5, 5, 5]), 100));
    expect(result).toEqual(["a", "b", "c"]);
  });

  test("某个间隔超时：已经到达的值照常产出，然后抛出 TimeoutError", async () => {
    const received: string[] = [];
    const start = performance.now();
    const error: unknown = await (async () => {
      try {
        for await (const item of idleTimeout(paced(["a", "b", "c"], [5, 5, 500]), 50)) {
          received.push(item);
        }
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect(received).toEqual(["a", "b"]);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("TimeoutError");
    expect((error as DOMException).message).toBe("超过 50ms 没有收到新数据");
    // 不能等上游的 500ms
    expect(performance.now() - start).toBeLessThan(300);
  });

  test("限制的是每次的间隔，不是总时长", async () => {
    // 总共 6 × 20 = 120ms，超过了 60ms，但每个间隔都不超过
    const result = await drain(
      idleTimeout(paced([1, 2, 3, 4, 5, 6], [20, 20, 20, 20, 20, 20]), 60),
    );
    expect(result).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("消费者在循环体里花的时间不算", async () => {
    const result: number[] = [];
    for await (const item of idleTimeout(paced([1, 2, 3], [0, 0, 0]), 30)) {
      result.push(item);
      await sleep(60); // 消费者很慢，但上游一直是随要随给的
    }
    expect(result).toEqual([1, 2, 3]);
  });

  test("超时后上游会被关闭（等它走到下一个 yield 时）", async () => {
    let closed = false;
    const stream = idleTimeout(
      paced([1, 2], [0, 100], () => {
        closed = true;
      }),
      20,
    );
    await expect(drain(stream)).rejects.toThrow("没有收到新数据");
    await sleep(150); // 上游的 100ms 结束后，排队的 return() 才生效
    expect(closed).toBe(true);
  });

  test("超时时不会卡住等待上游结束", async () => {
    const stream = idleTimeout(paced([1], [1000]), 20);
    const start = performance.now();
    await expect(drain(stream)).rejects.toThrow("没有收到新数据");
    expect(performance.now() - start).toBeLessThan(300);
  });

  test("消费者提前退出时，上游会被关闭", async () => {
    const { source, state } = tracked([1, 2, 3, 4]);
    for await (const item of idleTimeout(source, 100)) {
      if (item === 2) {
        break;
      }
    }
    await sleep(0);
    expect(state.closed).toBe(true);
    expect(state.pulled).toBe(2);
  });

  test("上游的异常原样传出来", async () => {
    async function* broken(): AsyncGenerator<number> {
      yield 1;
      throw new Error("连接断开");
    }
    await expect(drain(idleTimeout(broken(), 100))).rejects.toThrow("连接断开");
  });

  test("结束后不留下定时器", async () => {
    const countTimers = () =>
      process.getActiveResourcesInfo().filter((name) => name === "Timeout").length;
    const before = countTimers();
    expect(await drain(idleTimeout(paced([1, 2, 3], [1, 1, 1]), 10_000))).toEqual([1, 2, 3]);
    // 如果每次等待后没有 clearTimeout，这里会多出 3 到 4 个还在计时的 10 秒定时器
    expect(countTimers()).toBe(before);
  });
});
