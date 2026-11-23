/**
 * 练习 6-5：停止条件与错误恢复
 *
 * 课程：chapters/06-harness/05-stop-and-recover.md
 * 运行：pnpm ex 05-stop-and-recover
 *
 * 循环什么时候该停？出了错怎么办？这道题实现 harness 做这些决定的几个函数。
 *
 * 第一部分：afterTurn(finishReason, toolCallCount)
 *   一个回合结束后，执行工具（"run_tools"）还是停下（一个 StopReason）：
 *   - "length"：{ type: "length" }，哪怕有工具调用（被截断的参数可能不完整）
 *   - "content_filter"：{ type: "model_stopped", finishReason }
 *   - 其他情况下有工具调用：执行工具（有的服务商这时给的是 "stop"，或者干脆没有结束原因）
 *   - 没有工具调用："stop" 和 "unknown" 是 { type: "completed" }，其他原因是 model_stopped
 *
 * 第二部分：stableStringify(value) 和 createRepeatDetector(limit = 3)
 *   stableStringify：和 JSON.stringify 一样，但对象的键按字典序排列（嵌套的也是），这样 {"a":1,"b":2}
 *     和 {"b":2,"a":1} 得到同样的文本。值为 undefined 的键省略，数组里的 undefined 变成 null，
 *     顶层的 undefined 得到 "null"。
 *   createRepeatDetector：模型有时会陷入"一遍又一遍发出同样的调用"。check(calls) 在每个回合之后调用：
 *   - 这一批调用的"指纹"：每个调用是 `${name}(${参数})`，参数先 JSON.parse 再 stableStringify
 *     （不是合法 JSON 时用原文），所有调用的指纹排序后用 "\n" 连接。id 不参与
 *   - 和上一批相同就计数加一，否则从 1 开始；计数达到 limit 时返回 { name: 第一个调用的名字, times }
 *   - 空的一批（没有调用）清零；reset() 也清零
 *   - limit 不是不小于 2 的整数时抛出 RangeError
 *
 * 第三部分：repairHistory(messages, note = MISSING_RESULT)
 *   运行被中断时，记录里可能有"没有结果的工具调用"，下一次请求会被接口拒绝。返回修好的新数组：
 *   - assistant 消息的每个工具调用，都要在下一条非 tool 消息之前有一条对应的 tool 消息；
 *     缺少的补上 { role: "tool", tool_call_id, content: note }，放在这一组已有的结果后面，按调用的顺序
 *   - 找不到对应调用的 tool 消息（包括同一个调用的第二条结果）丢掉
 *   - 同一条 assistant 消息里重复出现的调用 id 只算一次（只需要一条结果）
 *   这正是第 1 章项目里"找出还没有结果的工具调用"的用武之地。
 *
 * 第四部分：shouldRetryStep(error, signal)
 *   模型的流中途出错，要不要把这一步整个重来？
 *   - 已经取消（signal.aborted），或者错误本身是 AbortError：不重试
 *   - ApiError：不重试。它来自建立连接的阶段，客户端已经按自己的策略重试过了
 *   - 其他错误（空闲超时、流提前结束、网络断开……）：重试
 */
import type { Message, RawToolCall, Usage } from "@learn-ts/agent-kit";
import { todo } from "../todo.ts";

export type StopReason =
  | { type: "completed" }
  | { type: "max_steps"; maxSteps: number }
  | { type: "length" }
  | { type: "model_stopped"; finishReason: string }
  | { type: "repeated_tool_calls"; name: string; times: number }
  | { type: "cancelled" }
  | { type: "error"; error: Error }
  | { type: "stopped_by_middleware"; middleware: string; reason: string };

/** 一次运行的结果（6.9 节的 harness 返回它） */
export interface AgentResult {
  messages: Message[];
  text: string;
  steps: number;
  usage: Usage;
  stopReason: StopReason;
}

export function afterTurn(finishReason: string, toolCallCount: number): "run_tools" | StopReason {
  return todo("实现 afterTurn");
}

export function stableStringify(value: unknown): string {
  return todo("实现 stableStringify");
}

export interface RepeatDetector {
  check(calls: readonly RawToolCall[]): { name: string; times: number } | undefined;
  reset(): void;
}

export function createRepeatDetector(limit = 3): RepeatDetector {
  return todo("实现 createRepeatDetector");
}

export const MISSING_RESULT = "（没有结果：运行在这次调用完成之前就结束了）";

export function repairHistory(
  messages: readonly Message[],
  note: string = MISSING_RESULT,
): Message[] {
  return todo("实现 repairHistory");
}

export function shouldRetryStep(error: unknown, signal?: AbortSignal): boolean {
  return todo("实现 shouldRetryStep");
}
