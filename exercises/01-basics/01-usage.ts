/**
 * 练习 1-1：token 用量
 *
 * 课程：chapters/01-basics/01-primitives-and-inference.md、02-objects-and-interfaces.md
 * 运行：pnpm ex 01-usage
 *
 * 每次调用大模型 API，响应里都会带上本次消耗的 token 数。agent 一次任务往往要调用
 * 模型很多次，所以需要把每次的用量累加起来，再估算费用。
 */
import { todo } from "../todo.ts";

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
  return todo("实现 totalTokens");
}

/**
 * 把两次调用的用量合并成一个新对象（不要修改参数）。
 *
 * cachedInputTokens 的规则：
 * - a 和 b 都没有这个属性 → 结果也 **没有** 这个属性（而不是值为 undefined）
 * - 至少一个有 → 结果为两者之和，缺少的一方按 0 计
 *
 * 提示：本仓库开启了 exactOptionalPropertyTypes，`{ cachedInputTokens: undefined }`
 * 无法通过类型检查。想一想怎样"有条件地"给对象加上一个属性。
 */
export function addUsage(a: Usage, b: Usage): Usage {
  return todo("实现 addUsage");
}

/**
 * 估算一次用量的费用（美元）。
 *
 * - 未命中缓存的输入 token（inputTokens - cachedInputTokens）按 inputPerMillion 计费
 * - 命中缓存的输入 token 按 cachedInputPerMillion 计费；没有提供该价格时按 inputPerMillion
 * - 输出 token 按 outputPerMillion 计费
 */
export function estimateCost(usage: Usage, pricing: Pricing): number {
  return todo("实现 estimateCost");
}
