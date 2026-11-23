/**
 * 停止条件与错误恢复（来自练习 6-5）
 */
import { isAbortError } from "../abort.ts";
import type { Message } from "../client.ts";
import { ApiError } from "../errors.ts";
import type { RawToolCall } from "../registry.ts";
import type { Usage } from "../usage.ts";

export type StopReason =
  | { type: "completed" }
  | { type: "max_steps"; maxSteps: number }
  | { type: "length" }
  | { type: "model_stopped"; finishReason: string }
  | { type: "repeated_tool_calls"; name: string; times: number }
  | { type: "cancelled" }
  | { type: "error"; error: Error }
  | { type: "stopped_by_middleware"; middleware: string; reason: string };

export interface AgentResult {
  messages: Message[];
  text: string;
  steps: number;
  usage: Usage;
  stopReason: StopReason;
}

export function afterTurn(finishReason: string, toolCallCount: number): "run_tools" | StopReason {
  if (finishReason === "length") {
    return { type: "length" };
  }
  if (finishReason === "content_filter") {
    return { type: "model_stopped", finishReason };
  }
  if (toolCallCount > 0) {
    return "run_tools";
  }
  if (finishReason === "stop" || finishReason === "unknown") {
    return { type: "completed" };
  }
  return { type: "model_stopped", finishReason };
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item === undefined ? null : item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function callKey(call: RawToolCall): string {
  let args: string;
  try {
    args = stableStringify(JSON.parse(call.arguments));
  } catch {
    args = call.arguments;
  }
  return `${call.name}(${args})`;
}

export interface RepeatDetector {
  check(calls: readonly RawToolCall[]): { name: string; times: number } | undefined;
  reset(): void;
}

export function createRepeatDetector(limit = 3): RepeatDetector {
  if (!Number.isInteger(limit) || limit < 2) {
    throw new RangeError(`limit 必须是不小于 2 的整数，收到的是 ${limit}`);
  }
  let lastKey: string | undefined;
  let times = 0;
  return {
    check(calls) {
      if (calls.length === 0) {
        lastKey = undefined;
        times = 0;
        return undefined;
      }
      const key = calls.map(callKey).sort().join("\n");
      times = key === lastKey ? times + 1 : 1;
      lastKey = key;
      return times >= limit ? { name: calls[0]!.name, times } : undefined;
    },
    reset() {
      lastKey = undefined;
      times = 0;
    },
  };
}

export const MISSING_RESULT = "（没有结果：运行在这次调用完成之前就结束了）";

export function repairHistory(
  messages: readonly Message[],
  note: string = MISSING_RESULT,
): Message[] {
  const repaired: Message[] = [];
  let pending: string[] = []; // 当前这组里还没有结果的调用 id，按调用的顺序

  const flush = (): void => {
    for (const id of pending) {
      repaired.push({ role: "tool", tool_call_id: id, content: note });
    }
    pending = [];
  };

  for (const message of messages) {
    if (message.role === "tool") {
      const index = pending.indexOf(message.tool_call_id);
      if (index !== -1) {
        pending.splice(index, 1);
        repaired.push(message);
      }
      // 否则：没有对应的调用，或者重复的结果，丢掉
      continue;
    }
    flush();
    repaired.push(message);
    if (message.role === "assistant") {
      for (const call of message.tool_calls ?? []) {
        if (!pending.includes(call.id)) {
          pending.push(call.id);
        }
      }
    }
  }
  flush();
  return repaired;
}

export function shouldRetryStep(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted || isAbortError(error)) {
    return false;
  }
  // ApiError 来自建立连接的阶段，客户端已经按自己的策略重试过了（3.7 节）：
  // 在这一层再重试，一次失败会变成"客户端重试次数 × 这里的重试次数"次请求
  return !(error instanceof ApiError);
}
