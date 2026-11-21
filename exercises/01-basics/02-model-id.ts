/**
 * 练习 1-2：模型 ID 与消息列表
 *
 * 课程：chapters/01-basics/03-arrays-and-tuples.md
 * 运行：pnpm ex 02-model-id
 */
import { todo } from "../todo.ts";

/** 模型 ID 拆分后的结果：[供应商, 模型名]。 */
export type ModelId = readonly [provider: string, model: string];

/**
 * 把形如 "anthropic/claude-sonnet" 的字符串拆成 [供应商, 模型名]。
 *
 * - 先去掉首尾空白
 * - 只按 **第一个** "/" 拆分："openrouter/meta/llama" → ["openrouter", "meta/llama"]
 * - 没有 "/" 时，供应商为 "unknown"："gpt-5" → ["unknown", "gpt-5"]
 * - 供应商或模型名为空（例如 ""、"openai/"、"/gpt-5"）时，抛出 Error，
 *   错误信息为 `无效的模型 ID："<原始输入>"`
 *
 * 提示：str.indexOf("/") 返回第一个 "/" 的位置（找不到时返回 -1）；
 * str.slice(start, end) 截取子串。
 */
export function splitModelId(id: string): ModelId {
  return todo("实现 splitModelId");
}

/**
 * splitModelId 的逆操作：["anthropic", "claude-sonnet"] → "anthropic/claude-sonnet"。
 * 供应商为 "unknown" 时只返回模型名。
 *
 * 提示：可以直接在参数位置解构元组。
 */
export function formatModelId(id: ModelId): string {
  return todo("实现 formatModelId");
}

/**
 * 返回最后 n 条消息组成的 **新数组**（不修改原数组）。
 * 这是"上下文窗口裁剪"最朴素的版本：对话太长时，只保留最近的几条。
 *
 * - n 大于等于消息总数时，返回全部消息（的副本）
 * - n 小于等于 0 时，返回空数组
 *
 * 提示：数组的 slice 方法总是返回新数组，参数为负数时从末尾倒数。
 */
export function lastN(messages: readonly string[], n: number): string[] {
  return todo("实现 lastN");
}

/**
 * 返回最后一条去掉首尾空白后不为空的消息（返回原始字符串，不要 trim）；找不到时返回 undefined。
 *
 * 提示：数组的 findLast(callback) 从后往前找第一个让 callback 返回 true 的元素。
 */
export function lastNonEmpty(messages: readonly string[]): string | undefined {
  return todo("实现 lastNonEmpty");
}
