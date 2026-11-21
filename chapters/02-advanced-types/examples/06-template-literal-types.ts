// 运行：pnpm tsx chapters/02-advanced-types/examples/06-template-literal-types.ts
// 配套课程：2.6 模板字面量类型

// ── 基本用法：带"形状"的字符串类型 ──────────────────────────────
type ToolCallId = `call_${string}`;
const id: ToolCallId = "call_8f2a";
// @ts-expect-error -- Type '"8f2a"' is not assignable to type '`call_${string}`'.
const badId: ToolCallId = "8f2a";
console.log(id, badId);

// ── 联合会被展开成所有组合 ────────────────────────────────────────
type Subject = "model" | "tool";
type Phase = "start" | "end" | "error";
type AgentEventName = `${Subject}:${Phase}`;
// "model:start" | "model:end" | "model:error" | "tool:start" | "tool:end" | "tool:error"
const eventName: AgentEventName = "tool:error";
console.log(eventName);

// ── 内置的大小写转换 ──────────────────────────────────────────────
type Loud = Uppercase<"stop">; // "STOP"
type HandlerName = `on${Capitalize<"toolStart">}`; // "onToolStart"
const loud: Loud = "STOP";
const handlerName: HandlerName = "onToolStart";
console.log(loud, handlerName);

// ── 类型安全的事件监听：事件名和载荷类型一一对应 ─────────────────────
interface AgentEvents {
  "model:start": { model: string };
  "tool:start": { name: string; args: unknown };
  "tool:end": { name: string; durationMs: number };
}
type Listener<E extends keyof AgentEvents> = (payload: AgentEvents[E]) => void;
// 用映射类型声明监听表，并为每个事件准备好空数组（为什么要这样写，见 2.8 节）
const listeners: { [E in keyof AgentEvents]: Listener<E>[] } = {
  "model:start": [],
  "tool:start": [],
  "tool:end": [],
};

function on<E extends keyof AgentEvents>(event: E, listener: Listener<E>): void {
  listeners[event].push(listener);
}
function emit<E extends keyof AgentEvents>(event: E, payload: AgentEvents[E]): void {
  for (const listener of listeners[event]) {
    listener(payload);
  }
}
on("tool:end", (payload) => console.log(`${payload.name} 用时 ${payload.durationMs}ms`)); // payload 类型自动推断
emit("tool:end", { name: "search", durationMs: 120 }); // search 用时 120ms
function neverCalled(): void {
  // @ts-expect-error -- Object literal may only specify known properties, but 'duration' does not exist in type '{ name: string; durationMs: number; }'. Did you mean to write 'durationMs'?
  emit("tool:end", { name: "search", duration: 120 });
}
void neverCalled;

// ── 用 infer 解析字符串 ───────────────────────────────────────────
// 很多 MCP 客户端把工具名写成 "服务器__工具"，避免不同服务器的工具重名
type SplitToolName<N extends string> = N extends `${infer Server}__${infer Tool}`
  ? { server: Server; tool: Tool }
  : never;
type Parsed = SplitToolName<"github__create_issue">; // { server: "github"; tool: "create_issue" }
type Nested = SplitToolName<"a__b__c">; // { server: "a"; tool: "b__c" } —— 前面的 infer 匹配尽可能短
type NoServer = SplitToolName<"search">; // never
const parsed: Parsed = { server: "github", tool: "create_issue" };
const nested: Nested = { server: "a", tool: "b__c" };
console.log(parsed, nested);

// ── 递归：snake_case 转 camelCase ─────────────────────────────────
type CamelCase<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : S;
type C1 = CamelCase<"finish_reason">; // "finishReason"
type C2 = CamelCase<"prompt_tokens_details">; // "promptTokensDetails"
const c1: C1 = "finishReason";
const c2: C2 = "promptTokensDetails";
console.log(c1, c2);

// 配合键重映射：把 API 返回的 snake_case 字段名整体转换
type CamelizeKeys<T> = { [K in keyof T as K extends string ? CamelCase<K> : K]: T[K] };
interface RawUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
type Usage = CamelizeKeys<RawUsage>; // { promptTokens: number; completionTokens: number; totalTokens: number }
const usage: Usage = { promptTokens: 10, completionTokens: 20, totalTokens: 30 };
console.log(usage.totalTokens);

// ── 从路径模板中提取参数名 ────────────────────────────────────────
type PathParams<P extends string> = P extends `${string}:${infer Param}/${infer Rest}`
  ? Param | PathParams<`/${Rest}`>
  : P extends `${string}:${infer Param}`
    ? Param
    : never;
type Params = PathParams<"/sessions/:sessionId/messages/:messageId">; // "sessionId" | "messageId"

function buildPath<P extends string>(pattern: P, params: Record<PathParams<P>, string>): string {
  return pattern.replace(/:(\w+)/g, (_, name: string) =>
    encodeURIComponent((params as Record<string, string>)[name] ?? ""),
  );
}
console.log(
  buildPath("/sessions/:sessionId/messages/:messageId", { sessionId: "s1", messageId: "m 2" }),
);
// /sessions/s1/messages/m%202
// @ts-expect-error -- Property 'messageId' is missing in type '{ sessionId: string; }' but required in type 'Record<"messageId" | "sessionId", string>'.
const missing = buildPath("/sessions/:sessionId/messages/:messageId", { sessionId: "s1" });
console.log(missing); // /sessions/s1/messages/ —— 类型检查拦住了它，但运行时照样能跑出一个错误的路径
const p: Params = "sessionId";
console.log(p);

// ── 从字符串里解析出数字字面量 ─────────────────────────────────────
type ParseInt<S extends string> = S extends `${infer N extends number}` ? N : never;
type MaxTokens = ParseInt<"4096">; // 4096
type NotNumber = ParseInt<"many">; // never
const maxTokens: MaxTokens = 4096;
console.log(maxTokens);
