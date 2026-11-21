import { describe, expect, test } from "vitest";
import { addUsage, estimateCost, totalTokens, type Usage } from "./01-usage.ts";

describe("totalTokens", () => {
  test("输入 + 输出", () => {
    expect(totalTokens({ inputTokens: 100, outputTokens: 20 })).toBe(120);
  });

  test("缓存 token 已经包含在 inputTokens 里，不重复计算", () => {
    expect(totalTokens({ inputTokens: 100, outputTokens: 20, cachedInputTokens: 80 })).toBe(120);
  });
});

describe("addUsage", () => {
  test("输入、输出分别相加", () => {
    expect(
      addUsage({ inputTokens: 100, outputTokens: 20 }, { inputTokens: 50, outputTokens: 5 }),
    ).toStrictEqual({ inputTokens: 150, outputTokens: 25 });
  });

  test("两者都没有 cachedInputTokens 时，结果里不能出现这个属性", () => {
    const result = addUsage(
      { inputTokens: 1, outputTokens: 1 },
      { inputTokens: 1, outputTokens: 1 },
    );
    // toStrictEqual 会区分"没有这个属性"和"属性值是 undefined"
    expect(result).toStrictEqual({ inputTokens: 2, outputTokens: 2 });
    expect("cachedInputTokens" in result).toBe(false);
  });

  test("只有一方有 cachedInputTokens 时，另一方按 0 计", () => {
    expect(
      addUsage(
        { inputTokens: 100, outputTokens: 10, cachedInputTokens: 60 },
        { inputTokens: 50, outputTokens: 5 },
      ),
    ).toStrictEqual({ inputTokens: 150, outputTokens: 15, cachedInputTokens: 60 });
  });

  test("双方都有 cachedInputTokens 时相加", () => {
    expect(
      addUsage(
        { inputTokens: 100, outputTokens: 10, cachedInputTokens: 60 },
        { inputTokens: 50, outputTokens: 5, cachedInputTokens: 0 },
      ),
    ).toStrictEqual({ inputTokens: 150, outputTokens: 15, cachedInputTokens: 60 });
  });

  test("不修改传入的对象", () => {
    const a: Usage = { inputTokens: 1, outputTokens: 2 };
    const b: Usage = { inputTokens: 3, outputTokens: 4, cachedInputTokens: 1 };
    addUsage(a, b);
    expect(a).toStrictEqual({ inputTokens: 1, outputTokens: 2 });
    expect(b).toStrictEqual({ inputTokens: 3, outputTokens: 4, cachedInputTokens: 1 });
  });
});

describe("estimateCost", () => {
  const pricing = { inputPerMillion: 2, outputPerMillion: 8 };

  test("按百万 token 计价", () => {
    // 1M 输入 × $2 + 0.5M 输出 × $8 = $6
    expect(estimateCost({ inputTokens: 1_000_000, outputTokens: 500_000 }, pricing)).toBeCloseTo(6);
  });

  test("小用量", () => {
    // 1000 × 2 / 1M + 200 × 8 / 1M = 0.002 + 0.0016
    expect(estimateCost({ inputTokens: 1000, outputTokens: 200 }, pricing)).toBeCloseTo(0.0036, 10);
  });

  test("缓存 token 使用缓存价格", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 800_000 };
    // 未命中 0.2M × $2 + 命中 0.8M × $0.5 = $0.8
    expect(estimateCost(usage, { ...pricing, cachedInputPerMillion: 0.5 })).toBeCloseTo(0.8);
  });

  test("没有缓存价格时，缓存 token 按普通输入价格计费", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 800_000 };
    expect(estimateCost(usage, pricing)).toBeCloseTo(2);
  });

  test("缓存价格为 0 时就是免费，而不是回退到普通价格", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 1_000_000 };
    expect(estimateCost(usage, { ...pricing, cachedInputPerMillion: 0 })).toBe(0);
  });

  test("没有用量就没有费用", () => {
    expect(estimateCost({ inputTokens: 0, outputTokens: 0 }, pricing)).toBe(0);
  });
});
