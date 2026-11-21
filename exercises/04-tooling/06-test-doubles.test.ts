import { describe, expect, expectTypeOf, test } from "vitest";
import { createFakeClock, createSpy, type SpyResult } from "./06-test-doubles.ts";

describe("createSpy", () => {
  test("像原函数一样调用，并记录参数和返回值", () => {
    const add = createSpy((a: number, b: number) => a + b);
    expect(add(1, 2)).toBe(3);
    expect(add(10, 20)).toBe(30);
    expect(add.calls).toEqual([
      [1, 2],
      [10, 20],
    ]);
    expect(add.results).toEqual([
      { type: "return", value: 3 },
      { type: "return", value: 30 },
    ]);

    // 类型：参数和结果都有准确的类型（由 pnpm typecheck 检查）
    expectTypeOf(add.calls).toEqualTypeOf<[a: number, b: number][]>();
    expectTypeOf(add.results).toEqualTypeOf<SpyResult<number>[]>();
  });

  test("记录抛出的错误，并原样抛出", () => {
    const error = new Error("坏了");
    const fail = createSpy((): never => {
      throw error;
    });
    expect(() => fail()).toThrow(error);
    expect(fail.results).toEqual([{ type: "throw", error }]);
    expect(fail.calls).toEqual([[]]);
  });

  test("异步函数：记录的是 Promise 本身", async () => {
    const complete = createSpy(async (prompt: string) => `回复：${prompt}`);
    const promise = complete("你好");
    expect(complete.results[0]).toEqual({ type: "return", value: promise });
    expect(await promise).toBe("回复：你好");
  });

  test("implement 换掉之后所有调用的实现", () => {
    const greet = createSpy((name: string) => `你好，${name}`);
    greet.implement((name) => `hi, ${name}`);
    expect(greet("a")).toBe("hi, a");
    expect(greet("b")).toBe("hi, b");
  });

  test("implementOnce 按顺序各用一次，然后恢复", () => {
    const next = createSpy(() => "默认");
    next.implementOnce(() => "第一次");
    next.implementOnce(() => "第二次");
    expect([next(), next(), next()]).toEqual(["第一次", "第二次", "默认"]);
  });

  test("implementOnce 优先于 implement", () => {
    const value = createSpy(() => 0);
    value.implementOnce(() => 1);
    value.implement(() => 2);
    expect([value(), value()]).toEqual([1, 2]);
  });

  test("reset 清空记录，但保留实现和数组对象", () => {
    const double = createSpy((n: number) => n * 2);
    const calls = double.calls;
    double.implement((n) => n * 3);
    double(1);
    double.reset();
    expect(double.calls).toEqual([]);
    expect(double.results).toEqual([]);
    expect(double(2)).toBe(6);
    expect(calls).toBe(double.calls);
    expect(calls).toEqual([[2]]);
  });
});

describe("createFakeClock", () => {
  test("now 从 start 开始，advance 推进时间", async () => {
    const clock = createFakeClock(1000);
    expect(clock.now()).toBe(1000);
    await clock.advance(250);
    expect(clock.now()).toBe(1250);
    await clock.advance(0);
    expect(clock.now()).toBe(1250);
  });

  test("sleep 在时间到了才完成", async () => {
    const clock = createFakeClock();
    let done = false;
    void clock.sleep(100).then(() => {
      done = true;
    });
    expect(clock.pending()).toBe(1);
    await clock.advance(99);
    expect(done).toBe(false);
    await clock.advance(1);
    expect(done).toBe(true);
    expect(clock.pending()).toBe(0);
  });

  test("sleep 完成时，now 正好是它的到期时间", async () => {
    const clock = createFakeClock();
    const seen: number[] = [];
    void clock.sleep(30).then(() => seen.push(clock.now()));
    void clock.sleep(10).then(() => seen.push(clock.now()));
    await clock.advance(100);
    expect(seen).toEqual([10, 30]);
    expect(clock.now()).toBe(100);
  });

  test("到期时间相同的，先登记的先完成", async () => {
    const clock = createFakeClock();
    const order: string[] = [];
    void clock.sleep(10).then(() => order.push("a"));
    void clock.sleep(10).then(() => order.push("b"));
    await clock.advance(10);
    expect(order).toEqual(["a", "b"]);
  });

  test("被唤醒的代码再次 sleep，只要还在目标时间之内，也会完成", async () => {
    const clock = createFakeClock();
    const ticks: number[] = [];
    async function loop(): Promise<void> {
      for (let i = 0; i < 5; i++) {
        await clock.sleep(100);
        ticks.push(clock.now());
      }
    }
    const running = loop();
    await clock.advance(250);
    expect(ticks).toEqual([100, 200]);
    expect(clock.pending()).toBe(1); // 第三次 sleep 在等 300
    await clock.advance(1000);
    expect(ticks).toEqual([100, 200, 300, 400, 500]);
    await running;
  });

  test("用假时钟测试一个带重试的函数，瞬间完成", async () => {
    const clock = createFakeClock();
    const attempt = createSpy(async (): Promise<string> => "成功");
    attempt.implementOnce(() => Promise.reject(new Error("503")));
    attempt.implementOnce(() => Promise.reject(new Error("503")));

    async function withRetry(): Promise<string> {
      for (let i = 0; ; i++) {
        try {
          return await attempt();
        } catch (error) {
          if (i === 2) throw error;
          await clock.sleep(1000 * 2 ** i); // 1000、2000
        }
      }
    }

    // 注意：withRetry 第一次失败要经过几个微任务才会调用 sleep，advance 必须先等它们
    const result = withRetry();
    await clock.advance(3000);
    expect(await result).toBe("成功");
    expect(attempt.calls).toHaveLength(3);
    expect(clock.now()).toBe(3000);
  });

  test("sleep(0) 和负数立刻完成", async () => {
    const clock = createFakeClock();
    await clock.sleep(0);
    await clock.sleep(-5);
    expect(clock.pending()).toBe(0);
  });

  test("时间不能倒流", async () => {
    const clock = createFakeClock();
    await expect(clock.advance(-1)).rejects.toThrow(RangeError);
  });
});
