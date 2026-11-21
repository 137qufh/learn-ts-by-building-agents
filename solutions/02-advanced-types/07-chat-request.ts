/**
 * 练习 2-7 参考答案：聊天请求
 */

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
  user?: string;
}

export type Tunables = Required<Pick<ChatRequest, "temperature" | "maxTokens" | "stream">>;

// 交叉之后，temperature 一边可选一边必需，结果是必需的。
// 也可以写成 Omit<ChatRequest, keyof Tunables> & Tunables，效果相同。
export type ResolvedRequest = ChatRequest & Tunables;

export type RequestUpdate = Partial<Omit<ChatRequest, "model" | "messages">>;

export type StrictOmit<T, K extends keyof T> = Omit<T, K>;

export type RequestSummary = Pick<ResolvedRequest, "model" | "temperature" | "maxTokens"> & {
  messageCount: number;
  toolNames: string[];
};

export async function fakeModel(request: { model: string }) {
  return { model: request.model, content: "你好！", finishReason: "stop" as const };
}

export type ModelReply = Awaited<ReturnType<typeof fakeModel>>;

export const DEFAULT_TUNABLES = { temperature: 1, maxTokens: 1024, stream: false };

export function resolveRequest(
  request: ChatRequest,
  defaults: Tunables = DEFAULT_TUNABLES,
): ResolvedRequest {
  // 后面的覆盖前面的：request 里有的字段优先。在 exactOptionalPropertyTypes 下，
  // request 的可选字段要么不存在、要么有值，不会出现"值为 undefined 覆盖了默认值"的情况。
  return { ...defaults, ...request };
}

export function applyUpdate(request: ResolvedRequest, update: RequestUpdate): ResolvedRequest {
  return { ...request, ...update };
}

export function redact<T extends ChatRequest>(request: T): StrictOmit<T, "user"> {
  // 解构出 user 丢掉，剩下的就是 Omit<T, "user">。变量名前的下划线表示"故意不用"。
  const { user: _user, ...rest } = request;
  return rest;
}

export function summarize(request: ResolvedRequest): RequestSummary {
  return {
    model: request.model,
    temperature: request.temperature,
    maxTokens: request.maxTokens,
    messageCount: request.messages.length,
    toolNames: request.tools?.map((tool) => tool.name) ?? [],
  };
}
