/**
 * 练习 6-2：按脚本回复的假模型
 *
 * 课程：chapters/06-harness/02-scripted-model.md
 * 运行：pnpm ex 02-scripted-model
 *
 * 测试 harness 不能依赖真的模型：慢、要花钱、每次回答不一样。第 3 章的假服务器在 HTTP 这一层假装成模型，
 * 测试客户端很合适；测试 harness 的逻辑时，HTTP 和 SSE 都是多余的。这道题写一个直接实现 Model 接口的假模型：
 * 每次调用 stream，按顺序消费脚本里的一步。
 *
 *   const model = createScriptedModel([
 *     { text: "我查一下", toolCalls: [{ name: "read_file", arguments: { path: "a.ts" } }] },
 *     (request) => ({ text: `收到 ${request.messages.length} 条消息` }),  // 根据请求决定怎么回复
 *     { fail: new Error("连接断开"), afterText: "说到一半" },             // 模拟流到一半出错
 *   ]);
 *
 * createScriptedModel(steps, { chunkSize = 4, delayMs = 0 })
 *   - chunkSize 不是正整数时立刻抛出 RangeError
 *   - 返回的对象有 stream、requests（收到的每个请求）、remaining（还剩几步，用 getter 实现）
 *
 * stream(request, { signal }) 是一个异步生成器（3.8 节）：
 *   1. signal 已经取消：抛出 signal.reason（提示：signal.throwIfAborted()），不消耗脚本，不记录请求
 *   2. 取出下一步；脚本用完时抛出 Error(`脚本已经用完：模型被调用了第 ${n} 次，脚本只有 ${steps.length} 步`)
 *   3. 把请求的 **副本**（structuredClone）记进 requests；函数形式的步骤用这份副本调用
 *   4. 文本按 **字符**（不是 UTF-16 单元，用 Array.from）每 chunkSize 个切成一个 text 事件；空文本不产生事件
 *   5. 是 fail 步骤：交出 afterText 的 text 事件后，抛出 fail
 *   6. 每个工具调用一个 tool_call 事件：
 *        id 默认是 `call_${n}`，n 在 **整个脚本** 里从 1 开始递增（这样 id 不会重复）；给了 id 的不占编号
 *        arguments 是字符串时原样使用，是对象时 JSON.stringify，没给时是 "{}"
 *   7. 最后一个 finish 事件：reason 默认是 "tool_calls"（有工具调用时）或 "stop"；给了 usage 就带上 usage
 *   - 每个事件交出之前：delayMs > 0 时先等 delayMs（可以被 signal 打断，用 agent-kit 的 abortableSleep），
 *     然后检查 signal
 */
import type { ChatRequest, Usage } from "@learn-ts/agent-kit";
import { todo } from "../todo.ts";
import type { Model } from "./01-agent-loop.ts";

export interface ScriptedToolCall {
  id?: string;
  name: string;
  arguments?: string | Record<string, unknown>;
}

export interface ScriptedReply {
  text?: string;
  toolCalls?: readonly ScriptedToolCall[];
  finishReason?: string;
  usage?: Usage;
}

/** 先交出 afterText，再抛出 fail：模拟流到一半断开 */
export interface ScriptedFailure {
  fail: Error;
  afterText?: string;
}

export type ScriptStep =
  ScriptedReply | ScriptedFailure | ((request: ChatRequest) => ScriptedReply);

export interface ScriptedModelOptions {
  /** 每个 text 事件几个字符，默认 4 */
  chunkSize?: number;
  /** 每个事件之前等多少毫秒，默认 0 */
  delayMs?: number;
}

export interface ScriptedModel extends Model {
  readonly requests: readonly ChatRequest[];
  readonly remaining: number;
}

export function createScriptedModel(
  steps: readonly ScriptStep[],
  options: ScriptedModelOptions = {},
): ScriptedModel {
  return todo("实现 createScriptedModel");
}
