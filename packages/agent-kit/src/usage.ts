/**
 * token 用量与费用估算（来自练习 1-1）
 */

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /**
   * 输入中命中缓存的 token 数，它是 inputTokens 的一部分（不是额外的）。
   * 并不是所有模型都会返回这个字段。
   */
  cachedInputTokens?: number;
}

/** 价格的单位都是"美元 / 每百万 token"。 */
export interface Pricing {
  inputPerMillion: number;
  outputPerMillion: number;
  /** 缓存命中的输入 token 的价格。没有提供时，缓存 token 按普通输入价格计费。 */
  cachedInputPerMillion?: number;
}

/** 返回输入和输出 token 的总数。 */
export function totalTokens(usage: Usage): number {
  return usage.inputTokens + usage.outputTokens;
}

/** 把两次调用的用量合并成一个新对象（不要修改参数）。 */
export function addUsage(a: Usage, b: Usage): Usage {
  const sum: Usage = {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };

  // 两者都没有时，什么都不做：结果里就不会出现这个属性。
  if (a.cachedInputTokens === undefined && b.cachedInputTokens === undefined) {
    return sum;
  }

  // ?? 在左边是 null 或 undefined 时取右边的值（1.6 节）。
  // 这里换成 || 结果碰巧一样，但在 estimateCost 里就会出错（见下方）。
  // 养成用 ?? 处理"缺省值"的习惯。
  //
  // 另一种常见写法是用展开运算符有条件地加属性：
  //   return { ...sum, ...(hasCached ? { cachedInputTokens: total } : {}) };
  return { ...sum, cachedInputTokens: (a.cachedInputTokens ?? 0) + (b.cachedInputTokens ?? 0) };
}

/** 估算一次用量的费用（美元）。 */
export function estimateCost(usage: Usage, pricing: Pricing): number {
  const cached = usage.cachedInputTokens ?? 0;
  const uncached = usage.inputTokens - cached;
  // 这里必须用 ??：cachedInputPerMillion 为 0 表示"缓存免费"，
  // 如果写成 ||，0 会被当成"没提供"，错误地回退到普通价格。
  const cachedPrice = pricing.cachedInputPerMillion ?? pricing.inputPerMillion;

  const dollars =
    uncached * pricing.inputPerMillion +
    cached * cachedPrice +
    usage.outputTokens * pricing.outputPerMillion;
  return dollars / 1_000_000;
}
