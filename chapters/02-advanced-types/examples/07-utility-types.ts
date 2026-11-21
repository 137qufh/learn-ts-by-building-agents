// 运行：pnpm tsx chapters/02-advanced-types/examples/07-utility-types.ts
// 配套课程：2.7 内置工具类型

interface ChatRequest {
  model: string;
  messages: readonly { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

// ── Partial / Required / Readonly ─────────────────────────────────
type RequestPatch = Partial<ChatRequest>; // 所有字段可选
type Tunables = Required<Pick<ChatRequest, "temperature" | "maxTokens" | "stream">>; // 挑出来并且都必填

const DEFAULTS: Readonly<Tunables> = { temperature: 1, maxTokens: 1024, stream: false };
function neverCalled(): void {
  // @ts-expect-error -- Cannot assign to 'temperature' because it is a read-only property.
  DEFAULTS.temperature = 0; // Readonly 只在编译期起作用：真执行的话，运行时照样会被改掉
}
void neverCalled;

// 常见组合：用户只需要提供部分参数，其余由默认值补齐
type ResolvedRequest = ChatRequest & Tunables;
function resolve(request: ChatRequest): ResolvedRequest {
  return { ...DEFAULTS, ...request };
}
const resolved = resolve({ model: "gpt-5", messages: [], temperature: 0.2 });
console.log(resolved.temperature, resolved.maxTokens); // 0.2 1024 —— maxTokens 的类型是 number，不再带 undefined

const patch: RequestPatch = { stream: true };
console.log({ ...resolved, ...patch }.stream); // true

// ── Pick / Omit ───────────────────────────────────────────────────
type RequestSummary = Pick<ChatRequest, "model" | "temperature">; // { model: string; temperature?: number }
type WithoutMessages = Omit<ChatRequest, "messages">;
const summary: RequestSummary = { model: resolved.model, temperature: resolved.temperature };
const settingsOnly: WithoutMessages = { model: "gpt-5", stream: true };
console.log(summary, settingsOnly);

// @ts-expect-error -- Type '"modle"' does not satisfy the constraint 'keyof ChatRequest'.
type Typo = Pick<ChatRequest, "modle">;
// Omit 却不检查键名：拼错了也不报错，只是什么都没删掉
type SilentTypo = Omit<ChatRequest, "mesages">;
const oops: SilentTypo = { model: "gpt-5", messages: [] }; // messages 还在！
console.log(oops.messages.length); // 0

// 想要检查键名的 Omit，自己包一层即可
type StrictOmit<T, K extends keyof T> = Omit<T, K>;
// @ts-expect-error -- Type '"mesages"' does not satisfy the constraint 'keyof ChatRequest'.
type Caught = StrictOmit<ChatRequest, "mesages">;

// ── Record / Exclude / Extract / NonNullable ──────────────────────
type Provider = "openai" | "anthropic" | "local";
type HostedProvider = Exclude<Provider, "local">; // "openai" | "anthropic"
const apiKeyEnv: Record<HostedProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};
type MaybeKey = string | undefined | null;
const key: NonNullable<MaybeKey> = apiKeyEnv.openai; // string
type Remote = Extract<Provider, `${string}i${string}`>; // "openai" | "anthropic"：名字里带 i 的
const remote: Remote = "anthropic";
console.log(key, remote);

// ── ReturnType / Parameters / Awaited ─────────────────────────────
async function callModel(request: ResolvedRequest, signal?: AbortSignal) {
  void signal;
  return { content: `你好，我是 ${request.model}`, finishReason: "stop" as const };
}
type CallArgs = Parameters<typeof callModel>; // [request: ResolvedRequest, signal?: AbortSignal | undefined]
type ModelReply = Awaited<ReturnType<typeof callModel>>; // { content: string; finishReason: "stop" }
const args: CallArgs = [resolved];
const reply: ModelReply = await callModel(...args); // await 等待异步结果，第 3 章详讲
console.log(reply.content); // 你好，我是 gpt-5

// ── Partial 只作用于第一层 ────────────────────────────────────────
interface AgentConfig {
  model: { name: string; temperature: number };
  maxTurns: number;
}
// @ts-expect-error -- Property 'temperature' is missing in type '{ name: string; }' but required in type '{ name: string; temperature: number; }'.
const shallow: Partial<AgentConfig> = { model: { name: "gpt-5" } };
console.log(shallow);
