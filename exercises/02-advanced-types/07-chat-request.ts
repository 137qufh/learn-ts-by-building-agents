/**
 * 练习 2-7：聊天请求
 *
 * 课程：chapters/02-advanced-types/07-utility-types.md
 * 运行：pnpm ex 07-chat-request
 *
 * 调用模型之前，agent 要把用户给的不完整请求补齐默认值；运行过程中可能要调整参数；
 * 写日志时只记录摘要，并且去掉用户标识。这道题全部用内置工具类型来描述这些"变体"，
 * 不要手写任何对象类型的字段（RequestSummary 的两个新字段除外）。
 *
 * 需要你写签名的函数先用 any 占位；类型测试在 07-chat-request.test-d.ts。
 * 不允许在你的答案里使用 any。
 */
import { todo, type Todo } from "../todo.ts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ToolSpec {
  name: string;
  description: string;
}

export interface ChatRequest {
  model: string;
  messages: readonly ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: readonly ToolSpec[];
  /** 终端用户的标识，供应商用来监测滥用。不应该出现在日志里。 */
  user?: string;
}

/** temperature、maxTokens、stream 三个字段，并且都是必需的。 */
export type Tunables = Todo;

/** 补齐默认值之后的请求：ChatRequest 的所有字段，其中 Tunables 的三个字段是必需的。 */
export type ResolvedRequest = Todo;

/** 运行过程中的调整：除了 model 和 messages 以外的字段，都可以选择性地提供。 */
export type RequestUpdate = Todo;

/** 和 Omit 一样，但 K 必须是 T 的键，拼错时报错。 */
export type StrictOmit<T, K extends keyof T> = Todo;

/**
 * 日志里的请求摘要：ResolvedRequest 的 model、temperature、maxTokens 三个字段，
 * 再加上 messageCount: number 和 toolNames: string[]。
 */
export type RequestSummary = Todo;

/** 一个模拟的模型调用（第 3 章会换成真的）。 */
export async function fakeModel(request: { model: string }) {
  return { model: request.model, content: "你好！", finishReason: "stop" as const };
}

/** fakeModel 异步返回的数据的类型。从 fakeModel 推导，不要手写。 */
export type ModelReply = Todo;

export const DEFAULT_TUNABLES = { temperature: 1, maxTokens: 1024, stream: false };

/** 用 defaults 补齐 request 中缺少的 Tunables 字段。defaults 默认是 DEFAULT_TUNABLES。不修改 request。 */
export function resolveRequest(request: ChatRequest, defaults?: any): any {
  return todo("实现 resolveRequest");
}

/** 返回应用了 update 的新请求。 */
export function applyUpdate(request: any, update: any): any {
  return todo("实现 applyUpdate");
}

/** 去掉 user 字段（不管它有没有），返回新对象。 */
export function redact(request: any): any {
  return todo("实现 redact");
}

/** 生成摘要。没有 tools 时 toolNames 是空数组。 */
export function summarize(request: any): any {
  return todo("实现 summarize");
}
