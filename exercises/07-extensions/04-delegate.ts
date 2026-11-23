/**
 * 练习 7-4：子 agent
 *
 * 课程：chapters/07-extensions/04-delegation.md
 * 运行：pnpm ex 04-delegate
 *
 * delegate(agent, task, options?) 跑一段新的对话：
 * - 不传 history。子 agent 看不到调用方的任何消息。
 * - 有 context 时，发给模型的用户消息是 `背景：\n${context}\n\n任务：\n${task}`。
 *   没有 context 时，用户消息就是 task。agent 自己的 system 提示仍然会加上。
 * - 有 signal 就传给 agent.run。harness 取消时 result 不会拒绝，stopReason 是 cancelled。
 * - 返回 { text, messages, steps, stopReason }，就是 run.result 里的这四项。
 *
 * parentSummary(result)：stopReason 是 completed 时原样返回 text。
 * 否则返回 `子 agent 没有完成（${type}）：${text}`。text 为空时用 "（没有回答）"。
 */
import type { Agent, Message, StopReason } from "@learn-ts/agent-kit";
import { todo } from "../todo.ts";

export interface DelegateOptions {
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
  options?: DelegateOptions,
): Promise<DelegateResult> {
  return todo("实现 delegate");
}

export function parentSummary(result: Pick<DelegateResult, "text" | "stopReason">): string {
  return todo("实现 parentSummary");
}
