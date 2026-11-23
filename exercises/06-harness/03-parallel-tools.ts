/**
 * 练习 6-3：并行执行工具，超时与取消
 *
 * 课程：chapters/06-harness/03-parallel-tools.md
 * 运行：pnpm ex 03-parallel-tools
 *
 * 模型一次可能请求好几个工具调用。练习 3-3 已经写过"顺序执行"和"全部并行"，这道题把它做成 harness
 * 真正需要的样子：有并发上限、每个调用有自己的超时、整体可以取消，而且 **永远不会拒绝**、**永远不会卡住**。
 *
 * runToolCalls(calls, execute, { concurrency = Infinity, timeoutMs, signal, onResult, now })
 *
 * 结果
 *   - Promise 的结果是每个调用的 ToolRun，顺序和 calls 相同（不是完成的顺序）
 *   - 每个调用完成时调用一次 onResult(run)，按完成的顺序（界面可以先显示先完成的）
 *   - durationMs = 完成时的 now() - 开始时的 now()；没有开始过的调用是 0。now 默认是 performance.now()
 *   - calls 为空时结果是 []；concurrency 不是正整数也不是 Infinity 时拒绝 RangeError
 *
 * 执行
 *   - 按顺序开始，同时执行的最多 concurrency 个；一个完成（无论怎样完成）就开始下一个
 *   - execute(call, signal)：每个调用传一个它自己的 signal，整体取消和它自己的超时都会让它取消
 *     （提示：每个调用一个 AbortController，用 AbortSignal.any 和外面的 signal 合并）
 *   - execute 返回 { ok: true }    → status "ok"
 *     execute 返回 { ok: false }   → status "error"，content 原样保留
 *     execute 抛出或拒绝（包括同步抛出，提示：Promise.try）
 *                                  → status "error"，content 是 `工具执行失败：${message}`（不是 Error 时用 String）
 *                                    但如果这时整体已经取消，status 是 "cancelled"
 *
 * 超时（给了 timeoutMs 时）
 *   - 到时间还没完成：取消它的 signal（reason 是一个 name 为 "TimeoutError" 的 DOMException），
 *     **立刻** 得到 status "timeout"，content 是 timeoutContent(name, timeoutMs)
 *   - 不等工具自己停下来，它占的名额也立刻让出来。Promise 没法被"杀死"，不听话的工具只能不再等它
 *   - 一个调用完成后清除它的定时器；全部完成后不能留下任何定时器
 *
 * 取消（signal 被取消时）
 *   - 所有还没完成的调用（包括还没开始的）**立刻** 得到 status "cancelled"，content 是 CANCELLED_CONTENT
 *   - 还没开始的调用不再执行；signal 一开始就是取消的，一个都不执行
 *
 * 同一个调用可能先超时、后来工具又返回了：以第一个结果为准，onResult 也只调用一次。
 */
import type { RawToolCall } from "@learn-ts/agent-kit";
import { todo } from "../todo.ts";

export type ToolStatus = "ok" | "error" | "timeout" | "cancelled";

export interface ToolRun {
  id: string;
  name: string;
  ok: boolean;
  content: string;
  status: ToolStatus;
  durationMs: number;
}

export type ExecuteTool = (
  call: RawToolCall,
  signal: AbortSignal,
) => Promise<{ ok: boolean; content: string }>;

export interface RunToolsOptions {
  concurrency?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onResult?: (run: ToolRun) => void;
  now?: () => number;
}

export const CANCELLED_CONTENT = "已取消：这次运行被中断了，工具没有执行完";

export function timeoutContent(name: string, ms: number): string {
  return `工具 ${name} 超过 ${ms}ms 没有完成，已停止`;
}

export async function runToolCalls(
  calls: readonly RawToolCall[],
  execute: ExecuteTool,
  options: RunToolsOptions = {},
): Promise<ToolRun[]> {
  return todo("实现 runToolCalls");
}
