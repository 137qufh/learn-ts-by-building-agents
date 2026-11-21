/**
 * 练习 1-4：停止原因
 *
 * 课程：chapters/01-basics/05-literal-types.md
 * 运行：pnpm ex 04-stop-reason
 *
 * 模型每次生成结束时，都会告诉你它为什么停下来："说完了"、"达到 token 上限"、
 * "想调用工具"……agent 循环正是根据这个原因决定下一步：继续执行工具，还是结束。
 * 麻烦的是，不同供应商对同一件事的叫法不一样，所以我们先统一成自己的类型。
 */
import { todo } from "../todo.ts";

export const STOP_REASONS = [
  "end_turn",
  "max_tokens",
  "stop_sequence",
  "tool_use",
  "refusal",
] as const;

/** "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | "refusal" */
export type StopReason = (typeof STOP_REASONS)[number];

/** agent 循环拿到停止原因之后的下一步。 */
export type NextStep = "run_tools" | "finish" | "fail";

/**
 * 返回停止原因的中文说明：
 *
 * | reason          | 说明                 |
 * | --------------- | -------------------- |
 * | end_turn        | 模型完成了回答       |
 * | max_tokens      | 达到了最大 token 数  |
 * | stop_sequence   | 遇到了停止序列       |
 * | tool_use        | 模型请求调用工具     |
 * | refusal         | 模型拒绝了请求       |
 *
 * 提示：用一个 Record<StopReason, string> 常量表，比一长串 if 更清楚，
 * 而且将来 StopReason 增加成员时，TypeScript 会提醒你补上说明。
 */
export function describeStopReason(reason: StopReason): string {
  return todo("实现 describeStopReason");
}

/**
 * 决定下一步：
 * - tool_use → "run_tools"（执行工具，然后把结果交回给模型）
 * - end_turn、stop_sequence → "finish"
 * - max_tokens、refusal → "fail"（回答不完整或被拒绝，需要上层处理）
 */
export function nextStep(reason: StopReason): NextStep {
  return todo("实现 nextStep");
}

/**
 * 把供应商返回的原始字符串转换成 StopReason；无法识别时返回 undefined。
 *
 * - 我们自己的五个名字（与 Anthropic 的命名相同）原样返回
 * - OpenAI 风格的名字需要转换：
 *     "stop" → "end_turn"，"length" → "max_tokens"，
 *     "tool_calls" → "tool_use"，"content_filter" → "refusal"
 * - 大小写敏感，不做 trim
 *
 * 陷阱提示：如果你用普通对象做映射表，想一想 `mapping["toString"]` 会返回什么。
 * 测试里有这个用例。可以用 Object.hasOwn(obj, key) 或者 Map 来避开它。
 */
export function parseStopReason(raw: string): StopReason | undefined {
  return todo("实现 parseStopReason");
}

/**
 * 统计每种停止原因出现的次数。结果必须包含 **所有** 五种原因，没出现过的计为 0。
 */
export function countReasons(reasons: readonly StopReason[]): Record<StopReason, number> {
  return todo("实现 countReasons");
}
