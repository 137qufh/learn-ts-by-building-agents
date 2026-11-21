/**
 * 练习 1-4：停止原因 —— 参考答案
 */

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

// 用 Record<StopReason, ...> 写常量表：漏写任何一种原因都会编译报错。
const LABELS: Record<StopReason, string> = {
  end_turn: "模型完成了回答",
  max_tokens: "达到了最大 token 数",
  stop_sequence: "遇到了停止序列",
  tool_use: "模型请求调用工具",
  refusal: "模型拒绝了请求",
};

const NEXT_STEPS: Record<StopReason, NextStep> = {
  end_turn: "finish",
  max_tokens: "fail",
  stop_sequence: "finish",
  tool_use: "run_tools",
  refusal: "fail",
};

/** 返回停止原因的中文说明。 */
export function describeStopReason(reason: StopReason): string {
  // 键的类型是 StopReason（而不是任意 string），所以这里的结果是 string，不带 undefined
  return LABELS[reason];
}

/** 决定下一步。 */
export function nextStep(reason: StopReason): NextStep {
  // 另一种写法是 switch 语句，配合 1.6 节的"穷尽性检查"。两种都好；
  // 常量表更紧凑，switch 更适合每个分支逻辑各不相同的情况。
  return NEXT_STEPS[reason];
}

// 用 Map 而不是普通对象：Map 只包含你放进去的键，不会继承 toString、constructor 这类原型属性。
const ALIASES = new Map<string, StopReason>([
  ["stop", "end_turn"],
  ["length", "max_tokens"],
  ["tool_calls", "tool_use"],
  ["content_filter", "refusal"],
  ...STOP_REASONS.map((reason) => [reason, reason] as const),
]);

/** 把供应商返回的原始字符串转换成 StopReason；无法识别时返回 undefined。 */
export function parseStopReason(raw: string): StopReason | undefined {
  // 如果用普通对象 const aliases: Record<string, StopReason> = {...}，
  // aliases["toString"] 会返回 Object.prototype.toString 这个函数（而 TS 认为它是 StopReason | undefined）。
  // 要用普通对象，就得先检查：Object.hasOwn(aliases, raw) ? aliases[raw] : undefined
  //
  // Map.get 的返回类型就是 StopReason | undefined，正好是我们要的。
  return ALIASES.get(raw);
}

/** 统计每种停止原因出现的次数。 */
export function countReasons(reasons: readonly StopReason[]): Record<StopReason, number> {
  const counts: Record<StopReason, number> = {
    end_turn: 0,
    max_tokens: 0,
    stop_sequence: 0,
    tool_use: 0,
    refusal: 0,
  };
  for (const reason of reasons) {
    counts[reason] += 1;
  }
  return counts;
}
