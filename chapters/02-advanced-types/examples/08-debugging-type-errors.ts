// 运行：pnpm tsx chapters/02-advanced-types/examples/08-debugging-type-errors.ts
// 配套课程：2.8 读懂和调试复杂的类型错误
//
// 这个文件里的每个 @ts-expect-error 后面只写了错误信息的第一行。
// 想看完整的错误，删掉那一行注释，在编辑器里悬停或者运行 pnpm typecheck。

// ── 1. 多层错误：从最后一行读起 ───────────────────────────────────
interface ToolCall {
  id: string;
  name: string;
  arguments: string; // 模型返回的参数是 JSON 字符串
}
interface AssistantMessage {
  role: "assistant";
  content: string;
  toolCalls: ToolCall[];
}
const fromModel = {
  role: "assistant" as const,
  content: "",
  toolCalls: [{ id: "call_1", name: "search", arguments: { query: "ts" } }],
};
// @ts-expect-error -- Type '{ role: "assistant"; content: string; toolCalls: ...; }' is not assignable to type 'AssistantMessage'.
const message: AssistantMessage = fromModel;
// 完整的错误一共 6 行，最后一行才是根因：
//   Types of property 'arguments' are incompatible.
//     Type '{ query: string; }' is not assignable to type 'string'.
console.log(message.toolCalls.length); // 1

// ── 2. 让错误报在正确的位置 ───────────────────────────────────────
interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
// 没有标注：拼错的 descripton 不会在这里报错，而是在很远的使用处报错
const looseSpec = { name: "search", descripton: "搜索网页", parameters: {} };
function register(spec: ToolSpec): string {
  return spec.name;
}
// @ts-expect-error -- Property 'description' is missing in type '{ name: string; descripton: string; parameters: {}; }' but required in type 'ToolSpec'.
register(looseSpec);

// 加上 satisfies（或类型标注），错误就报在定义处，还会提示正确的拼写
const checkedSpec = {
  name: "search",
  // @ts-expect-error -- Object literal may only specify known properties, but 'descripton' does not exist in type 'ToolSpec'. Did you mean to write 'description'?
  descripton: "搜索网页",
  parameters: {},
} satisfies ToolSpec;
void checkedSpec;

// ── 3a. 拆分：把复杂的类型拆成中间步骤，逐个悬停 ──────────────────
interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}
type Step1 = { [K in keyof Usage]: Usage[K] extends number ? K : never };
// 悬停：{ inputTokens: "inputTokens"; outputTokens: "outputTokens"; cachedTokens?: never }
type Step2 = Step1[keyof Usage]; // "inputTokens" | "outputTokens" | undefined
const strayKey: Step2 = undefined; // 能编译：问题出在 Step1 里保留下来的 "?"
console.log(strayKey); // undefined

// ── 3b. Prettify：让悬停提示显示展开后的结构 ───────────────────────
type Prettify<T> = { [K in keyof T]: T[K] } & {};
type WithDefaults = ToolSpec & { timeoutMs: number };
type Shown = Prettify<WithDefaults>;
// 悬停 WithDefaults 只显示 "ToolSpec & { timeoutMs: number; }"
// 悬停 Shown 显示 { name: string; description: string; parameters: Record<string, unknown>; timeoutMs: number; }
const spec: Shown = { name: "search", description: "搜索", parameters: {}, timeoutMs: 1000 };
console.log(spec.timeoutMs); // 1000

// ── 4. 关联的联合：参数变成了交叉类型或 never ──────────────────────
interface ToolArgs {
  search: { query: string };
  get_weather: { city: string; days: number };
}
const handlers: { [K in keyof ToolArgs]: (args: ToolArgs[K]) => string } = {
  search: (args) => `搜索：${args.query}`,
  get_weather: (args) => `${args.city} 未来 ${args.days} 天：晴`,
};

type AnyCall =
  | { name: "search"; args: ToolArgs["search"] }
  | { name: "get_weather"; args: ToolArgs["get_weather"] };
function dispatchWrong(call: AnyCall): string {
  // @ts-expect-error -- Argument of type '{ query: string; } | { city: string; days: number; }' is not assignable to parameter of type '{ city: string; days: number; } & { query: string; }'.
  return handlers[call.name](call.args);
}
void dispatchWrong;

// 修复：把调用写成"以键 K 为参数"的泛型，并用映射类型生成联合
type Call<K extends keyof ToolArgs = keyof ToolArgs> = {
  [P in K]: { name: P; args: ToolArgs[P] };
}[K];
function dispatch<K extends keyof ToolArgs>(call: Call<K>): string {
  return handlers[call.name](call.args); // ✅ handlers[K] 接收 ToolArgs[K]，call.args 正是 ToolArgs[K]
}
const calls: Call[] = [
  { name: "search", args: { query: "TypeScript" } },
  { name: "get_weather", args: { city: "北京", days: 3 } },
];
for (const call of calls) {
  console.log(dispatch(call)); // 搜索：TypeScript / 北京 未来 3 天：晴
}

// ── 5. Omit 压扁了联合 ───────────────────────────────────────────
type StoredMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "tool"; toolCallId: string; content: string };

type NewMessageWrong = Omit<StoredMessage, "id">; // { role: "user" | "tool"; content: string }
// @ts-expect-error -- Object literal may only specify known properties, and 'toolCallId' does not exist in type 'NewMessageWrong'.
const wrong: NewMessageWrong = { role: "tool", toolCallId: "call_1", content: "晴" };
void wrong;

// 修复：让 Omit 分配到联合的每个成员上
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewMessage = DistributiveOmit<StoredMessage, "id">;
const right: NewMessage = { role: "tool", toolCallId: "call_1", content: "晴" };
console.log(right.role); // tool

// ── 6. "could be instantiated with a different subtype" ───────────
function createWrong<T extends { id: string }>(): T {
  // @ts-expect-error -- Type '{ id: string; }' is not assignable to type 'T'.
  return { id: "msg_1" };
}
void createWrong;
// 调用方可以选择 T = { id: string; role: "user" }，而这个函数根本造不出 role。
// 返回值不依赖输入时，就不该用泛型：
function createId(): { id: string } {
  return { id: "msg_1" };
}
console.log(createId().id); // msg_1

// ── 7. 自定义错误信息：让类型告诉使用者哪里错了 ────────────────────
type NoDuplicate<Name extends string, Existing extends string> = Name extends Existing
  ? `工具 "${Name}" 已经注册过了`
  : Name;
function addTool<const Existing extends string, const Name extends string>(
  existing: readonly Existing[],
  name: NoDuplicate<Name, Existing>,
): readonly (Existing | Name)[] {
  return [...existing, name as Name];
}
console.log(addTool(["search"], "get_weather")); // [ 'search', 'get_weather' ]
// @ts-expect-error -- Argument of type '"search"' is not assignable to parameter of type '"工具 \"search\" 已经注册过了"'.
addTool(["search"], "search");
