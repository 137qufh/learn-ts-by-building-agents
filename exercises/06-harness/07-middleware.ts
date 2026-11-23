/**
 * 练习 6-7：钩子与中间件
 *
 * 课程：chapters/06-harness/07-middleware.md
 * 运行：pnpm ex 07-middleware
 *
 * 权限确认、日志、修改请求、给工具结果脱敏、预算控制……这些需求各不相同，但都要"插进"主循环的某个位置。
 * 把它们都写进主循环，主循环很快就没法读了。中间件让使用者从外面插进来。
 *
 * 第一部分：compose(wrappers, handler)
 *   "洋葱模型"：每个包装拿到输入和 next，可以在调用 next 前后做事、修改输入和结果、捕获错误、甚至不调用 next。
 *   - wrappers[0] 在最外层；最里层是 handler
 *   - 返回的函数可以反复调用
 *   - 包装或 handler 同步抛出，也变成拒绝（Promise.try）
 *   - 同一次调用里，一个包装调用 next 两次：第二次的 Promise 拒绝 Error("next() 被调用了多次")
 *
 * 第二部分：主循环的三个插入点（AgentMiddleware 的三个可选方法）
 *   runBeforeModel(middleware, request, info)：按顺序调用每个 beforeModel，每个拿到上一个的结果；
 *     返回 undefined 表示不修改。结果是最后的请求
 *   runAfterStep(middleware, info)：按顺序调用 afterStep，第一个返回 { stop } 的说了算，
 *     结果是 { middleware: 它的 name, reason: stop }，后面的不再调用；没有人要求停下时是 undefined
 *   toolPipeline(middleware, execute)：把所有 wrapToolCall 按顺序组合起来（没有 wrapToolCall 的跳过）
 *
 * 第三部分：requireApproval(tools, ask)
 *   一个中间件（name 是 "require-approval"）：调用 tools 里的工具之前先 ask(call)。
 *   同意就执行；拒绝时不执行，结果是 { ok: false, content:
 *   `用户拒绝了这次 ${工具名} 调用。不要重试同样的操作，换一种做法或者直接回答。` }。
 *   不在名单里的工具直接执行，不询问。
 */
import type { ChatRequest, Message, RawToolCall } from "@learn-ts/agent-kit";
import { todo } from "../todo.ts";

export type Next<A, R> = (input: A) => Promise<R>;
export type Wrapper<A, R> = (input: A, next: Next<A, R>) => Promise<R>;

export function compose<A, R>(wrappers: readonly Wrapper<A, R>[], handler: Next<A, R>): Next<A, R> {
  return todo("实现 compose");
}

export interface StepInfo {
  step: number;
  /** 这一刻的聊天记录（副本） */
  messages: readonly Message[];
}

export interface ToolInvocation {
  call: RawToolCall;
  step: number;
  signal: AbortSignal;
}

export interface ToolOutcome {
  ok: boolean;
  content: string;
}

export interface AgentMiddleware {
  name: string;
  /** 每次调用模型之前：返回新的请求，或者 undefined 表示不修改 */
  beforeModel?: (
    request: ChatRequest,
    info: StepInfo,
  ) => ChatRequest | undefined | Promise<ChatRequest | undefined>;
  /** 包装每一次工具调用 */
  wrapToolCall?: Wrapper<ToolInvocation, ToolOutcome>;
  /** 每一步的工具执行完之后：返回 { stop } 让循环停下 */
  afterStep?: (
    info: StepInfo,
  ) => { stop: string } | undefined | Promise<{ stop: string } | undefined>;
}

export async function runBeforeModel(
  middleware: readonly AgentMiddleware[],
  request: ChatRequest,
  info: StepInfo,
): Promise<ChatRequest> {
  return todo("实现 runBeforeModel");
}

export async function runAfterStep(
  middleware: readonly AgentMiddleware[],
  info: StepInfo,
): Promise<{ middleware: string; reason: string } | undefined> {
  return todo("实现 runAfterStep");
}

export function toolPipeline(
  middleware: readonly AgentMiddleware[],
  execute: Next<ToolInvocation, ToolOutcome>,
): Next<ToolInvocation, ToolOutcome> {
  return todo("实现 toolPipeline");
}

export function requireApproval(
  tools: readonly string[],
  ask: (call: RawToolCall) => boolean | Promise<boolean>,
): AgentMiddleware {
  return todo("实现 requireApproval");
}
