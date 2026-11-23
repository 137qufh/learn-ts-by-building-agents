/**
 * 练习 7-4 参考答案：把另一个 agent 当作一次调用。
 *
 * 子 agent 看不到父对话。要给它的背景写进任务本身，父 agent 的 system 提示仍由 createAgent 加上。
 */
import type { Agent, Message, StopReason } from "@learn-ts/agent-kit";

export interface DelegateOptions {
  /** 子 agent 完成任务需要的背景。不要把父对话、密钥塞进来。 */
  context?: string;
  signal?: AbortSignal;
}

export interface DelegateResult {
  text: string;
  messages: Message[];
  steps: number;
  stopReason: StopReason;
}

export async function delegate(
  agent: Agent,
  task: string,
  options: DelegateOptions = {},
): Promise<DelegateResult> {
  const input =
    options.context === undefined ? task : `背景：\n${options.context}\n\n任务：\n${task}`;
  // 不传 history：createAgent 会用自己的 system 提示起一段新对话。
  // 父对话里的工具结果、其他用户的内容，都不会出现在子 agent 的请求里。
  const run = agent.run(input, options.signal === undefined ? {} : { signal: options.signal });
  const result = await run.result;
  return {
    text: result.text,
    messages: result.messages,
    steps: result.steps,
    stopReason: result.stopReason,
  };
}

/** 交还给父模型的只有这一段文字。子 agent 的完整记录留在 DelegateResult.messages 里供调试。 */
export function parentSummary(result: Pick<DelegateResult, "text" | "stopReason">): string {
  if (result.stopReason.type === "completed") {
    return result.text;
  }
  const text = result.text === "" ? "（没有回答）" : result.text;
  return `子 agent 没有完成（${result.stopReason.type}）：${text}`;
}
