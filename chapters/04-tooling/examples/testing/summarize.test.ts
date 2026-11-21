// 4.6 节示例：同一个函数，用不同的测试替身来测试。
// 运行：pnpm test chapters/04-tooling/examples/testing

import { test as base, describe, expect, expectTypeOf, vi } from "vitest";
import { summarize, type Cache, type Llm } from "./summarize.ts";

// ── 伪造对象（fake）：一个真的能用的简化实现 ─────────────────────────────
class MemoryCache implements Cache {
  readonly data = new Map<string, string>();
  get(key: string): Promise<string | undefined> {
    return Promise.resolve(this.data.get(key));
  }
  set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
    return Promise.resolve();
  }
}

// ── 夹具（fixture）：每个测试自动拿到一份全新的 cache ───────────────────
const test = base.extend<{ cache: MemoryCache }>({
  // Vitest 靠第一个参数的解构形式分析夹具之间的依赖，所以即使不依赖别的夹具，也要写成 {}
  // eslint-disable-next-line no-empty-pattern
  cache: async ({}, use) => {
    const cache = new MemoryCache();
    await use(cache); // use 之前是准备，之后是清理
    cache.data.clear();
  },
});

describe("用桩（stub）和间谍（spy）", () => {
  test("缓存没有命中时调用模型，并把结果存进缓存", async ({ cache }) => {
    // vi.fn 创建一个记录所有调用的函数；类型参数让它有准确的签名
    const complete = vi.fn<Llm["complete"]>().mockResolvedValue("一句话总结");

    const result = await summarize("很长的文字", { llm: { complete }, cache });

    expect(result).toMatchObject({ text: "一句话总结", cached: false });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith("用一句话总结：很长的文字");
    expect(cache.data.get("summary:很长的文字")).toBe("一句话总结"); // 检查结果，而不是检查 set 被调用了
  });

  test("缓存命中时不调用模型", async ({ cache }) => {
    await cache.set("summary:很长的文字", "以前的总结");
    const complete = vi.fn<Llm["complete"]>();

    const result = await summarize("很长的文字", { llm: { complete }, cache });

    expect(result.cached).toBe(true);
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("时间：注入时钟，或者用假定时器", () => {
  test("注入 now 和 sleep：完全可控，不需要任何魔法", async ({ cache }) => {
    let clock = 0;
    const sleeps: number[] = [];
    const complete = vi
      .fn<Llm["complete"]>()
      .mockRejectedValueOnce(new Error("503"))
      .mockImplementationOnce(() => {
        clock += 250;
        return Promise.resolve("第二次成功了");
      });

    const result = await summarize("文字", {
      llm: { complete },
      cache,
      now: () => clock,
      sleep: (ms) => {
        sleeps.push(ms);
        clock += ms;
        return Promise.resolve();
      },
    });

    expect(result).toEqual({ text: "第二次成功了", cached: false, ms: 1250 });
    expect(sleeps).toEqual([1000]);
  });

  test("假定时器：代码用的是真的 setTimeout，由测试来拨动时间", async ({ cache }) => {
    vi.useFakeTimers();
    try {
      const complete = vi
        .fn<Llm["complete"]>()
        .mockRejectedValueOnce(new Error("503"))
        .mockResolvedValueOnce("第二次成功了");

      const promise = summarize("文字", { llm: { complete }, cache });
      await vi.advanceTimersByTimeAsync(999);
      expect(complete).toHaveBeenCalledTimes(1); // 还在等
      await vi.advanceTimersByTimeAsync(1);
      expect(complete).toHaveBeenCalledTimes(2); // 1 秒到了，重试

      expect((await promise).text).toBe("第二次成功了");
    } finally {
      vi.useRealTimers(); // 一定要恢复，否则会影响后面的测试
    }
  });
});

describe("参数化与快照", () => {
  test.for([
    { input: "a", prompt: "用一句话总结：a" },
    { input: "多行\n文字", prompt: "用一句话总结：多行\n文字" },
  ])("提示词：$input", async ({ input, prompt }, { expect }) => {
    const complete = vi.fn<Llm["complete"]>().mockResolvedValue("x");
    await summarize(input, { llm: { complete }, cache: new MemoryCache() });
    expect(complete).toHaveBeenCalledWith(prompt);
  });

  test("内联快照：期望值由 Vitest 写进测试文件", async ({ cache }) => {
    const complete = vi.fn<Llm["complete"]>().mockResolvedValue("总结");
    await summarize("文字", { llm: { complete }, cache, now: () => 0 });
    expect(complete.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "用一句话总结：文字",
        ],
      ]
    `);
  });
});

test("类型断言也可以写在运行时测试里（由 tsc 检查，运行时什么也不做）", () => {
  expectTypeOf(summarize).returns.resolves.toEqualTypeOf<{
    text: string;
    cached: boolean;
    ms: number;
  }>();
});
