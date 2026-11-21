// 运行：pnpm tsx chapters/01-basics/examples/05-literal-types.ts
// 配套课程：1.5 字面量类型

// ── 字面量类型：只允许一个具体的值 ────────────────────────────────
let onlyUser: "user" = "user";
// @ts-expect-error -- Type '"assistant"' is not assignable to type '"user"'.
onlyUser = "assistant";

// ── 字面量联合：从几个值里选一个 ──────────────────────────────────
type Role = "system" | "user" | "assistant" | "tool";

function badge(role: Role): string {
  return `[${role}]`;
}
console.log(badge("assistant")); // [assistant]
// @ts-expect-error -- Argument of type '"asistant"' is not assignable to parameter of type 'Role'.
badge("asistant"); // 拼写错误当场被发现，编辑器还会自动补全四个合法值

// ── 陷阱：对象属性会被"拓宽"成 string ─────────────────────────────
const draft = { role: "user", content: "hi" }; // role 的类型是 string，不是 "user"
// @ts-expect-error -- Argument of type 'string' is not assignable to parameter of type 'Role'.
badge(draft.role);

// 解决办法 1：给对象标注类型（最常用）
interface Message {
  role: Role;
  content: string;
}
const typed: Message = { role: "user", content: "hi" };
console.log(badge(typed.role)); // [user]

// 解决办法 2：as const —— 整个对象变成只读，属性变成字面量类型
const frozen = { role: "user", content: "hi" } as const; // { readonly role: "user"; readonly content: "hi" }
console.log(badge(frozen.role)); // [user]

// ── 从数组推导出联合类型：运行时的列表和类型永远同步 ──────────────
const STOP_REASONS = ["end_turn", "max_tokens", "tool_use"] as const;
type StopReason = (typeof STOP_REASONS)[number]; // "end_turn" | "max_tokens" | "tool_use"

const reason: StopReason = "tool_use";
console.log(STOP_REASONS.length, reason); // 3 tool_use —— 运行时可以遍历、校验；类型层面可以约束

// ── 不用 enum：用 as const 对象代替 ───────────────────────────────
// enum LogLevel { Debug, Info }  ← 本仓库开启了 erasableSyntaxOnly，不能用 enum
const LogLevel = {
  Debug: "debug",
  Info: "info",
  Error: "error",
} as const;
type LogLevel = (typeof LogLevel)[keyof typeof LogLevel]; // "debug" | "info" | "error"

function logAt(level: LogLevel, message: string): string {
  return `${level.toUpperCase()}: ${message}`;
}
console.log(logAt(LogLevel.Info, "started")); // INFO: started
console.log(logAt("error", "boom")); // ERROR: boom —— 直接写字面量也可以

// ── Record<Role, ...>：保证每个角色都有对应的值 ───────────────────
const ROLE_LABELS: Record<Role, string> = {
  system: "系统",
  user: "用户",
  assistant: "助手",
  tool: "工具",
}; // 少写一个角色会报错；以后给 Role 加新成员时，这里也会提醒你补上
console.log(ROLE_LABELS.assistant); // 助手

// @ts-expect-error -- Property 'tool' is missing in type '{ system: string; user: string; assistant: string; }' but required in type 'Record<Role, string>'.
const missingTool: Record<Role, string> = { system: "系统", user: "用户", assistant: "助手" };
void missingTool;

// ── satisfies：检查是否符合类型，但保留更精确的推断 ────────────────
interface Pricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

// 用类型标注：键可以是任意字符串，所以读取时类型带 undefined，拼错键名也不会报错
const annotated: Record<string, Pricing> = {
  "gpt-5": { inputPerMillion: 1.25, outputPerMillion: 10 },
};
const maybePrice = annotated["gpt-5"]; // Pricing | undefined
console.log(maybePrice?.inputPerMillion); // 1.25

// 用 satisfies：同样检查每个值都是 Pricing，但 TS 记住了具体有哪些键
const PRICES = {
  "gpt-5": { inputPerMillion: 1.25, outputPerMillion: 10 },
  "gpt-5-mini": { inputPerMillion: 0.25, outputPerMillion: 2 },
} satisfies Record<string, Pricing>;
console.log(PRICES["gpt-5"].inputPerMillion); // 1.25 —— 类型是 Pricing 的字段 number，不带 undefined
// @ts-expect-error -- Property 'gpt-6' does not exist on type '{ "gpt-5": ...; "gpt-5-mini": ...; }'. Did you mean 'gpt-5'?
console.log(PRICES["gpt-6"]); // undefined

const wrongShape = {
  // @ts-expect-error -- Object literal may only specify known properties, and 'input' does not exist in type 'Pricing'.
  "gpt-5": { input: 1.25, outputPerMillion: 10 },
} satisfies Record<string, Pricing>;
void wrongShape;

// ── 模板字面量类型（第 2 章深入） ─────────────────────────────────
type ToolCallId = `call_${string}`;
const callId: ToolCallId = "call_abc123";
// @ts-expect-error -- Type '"abc123"' is not assignable to type '`call_${string}`'.
const badId: ToolCallId = "abc123";
console.log(callId, badId);
