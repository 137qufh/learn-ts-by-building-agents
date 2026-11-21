// 运行：pnpm tsx chapters/02-advanced-types/examples/04-conditional-types.ts
// 配套课程：2.4 条件类型

// ── 基本语法：T extends U ? X : Y ─────────────────────────────────
type IsString<T> = T extends string ? true : false;
type A = IsString<"gpt-5">; // true
type B = IsString<42>; // false
const a: A = true;
const b: B = false;
console.log(a, b);

// ── 分配：T 是联合时，条件类型对每个成员分别求值，再合并结果 ──────────
type C = IsString<"gpt-5" | 42>; // boolean —— 即 true | false
const c: C = Math.random() > 0.5;
console.log(typeof c); // boolean

// 用分配实现"从联合里删掉 / 留下某些成员"，标准库的 Exclude 和 Extract 就是这样写的
type MyExclude<T, U> = T extends U ? never : T;
type MyExtract<T, U> = T extends U ? T : never;
type Role = "system" | "user" | "assistant" | "tool";
type Speaker = MyExclude<Role, "system" | "tool">; // "user" | "assistant"
type Internal = MyExtract<Role, "system" | "tool" | "developer">; // "system" | "tool"
const s: Speaker = "user";
const i: Internal = "tool";
console.log(s, i);

// 同样的套路可以去掉 null 和 undefined（标准库的 NonNullable 现在写成 T & {}，效果相同）
type MyNonNullable<T> = T extends null | undefined ? never : T;
type MaybeName = string | null | undefined;
const definitely: MyNonNullable<MaybeName> = "search"; // string
console.log(definitely);

// ── 从可辨识联合里挑出成员 ────────────────────────────────────────
interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}
type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

type MessageOfRole<R extends Message["role"]> = Extract<Message, { role: R }>;
type ToolMessage = MessageOfRole<"tool">; // { role: "tool"; toolCallId: string; content: string }

// 配合类型守卫：过滤出来的数组类型是精确的
function ofRole<R extends Message["role"]>(
  messages: readonly Message[],
  role: R,
): MessageOfRole<R>[] {
  return messages.filter((m): m is MessageOfRole<R> => m.role === role);
}
const history: Message[] = [
  { role: "user", content: "北京天气怎么样？" },
  {
    role: "assistant",
    content: "",
    toolCalls: [{ id: "call_1", name: "get_weather", arguments: "{}" }],
  },
  { role: "tool", toolCallId: "call_1", content: "晴，25°C" },
];
const toolMessages: ToolMessage[] = ofRole(history, "tool");
console.log(toolMessages[0]?.toolCallId); // call_1 —— 不需要再收窄

// ── 阻止分配：把两边都包进元组 ────────────────────────────────────
type IsStringStrict<T> = [T] extends [string] ? true : false;
type D = IsStringStrict<"gpt-5" | 42>; // false —— 把联合当成一个整体判断
const d: D = false;
console.log(d);

// 经典陷阱：never 是"空的联合"，分配之后什么也不剩
type IsNeverWrong<T> = T extends never ? true : false;
type IsNever<T> = [T] extends [never] ? true : false;
type E = IsNeverWrong<never>; // never —— 而不是 true！
type F = IsNever<never>; // true
const f: F = true;
// @ts-expect-error -- Type 'true' is not assignable to type 'never'.
const e: E = true;
console.log(e, f);

// ── 和映射类型配合：找出值为某种类型的键 ──────────────────────────
interface ChatSettings {
  model: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
}
// 先映射成 { model: never; temperature: "temperature"; ... }，再用 [keyof T] 取出所有值
type KeysOfType<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T];
type NumericSetting = KeysOfType<ChatSettings, number>; // "temperature" | "maxTokens"

function bump(settings: ChatSettings, key: NumericSetting, delta: number): ChatSettings {
  return { ...settings, [key]: settings[key] + delta }; // settings[key] 一定是 number
}
const base: ChatSettings = { model: "gpt-5", temperature: 0.5, maxTokens: 1000, stream: true };
console.log(bump(base, "maxTokens", 24).maxTokens); // 1024
// @ts-expect-error -- Argument of type '"model"' is not assignable to parameter of type 'NumericSetting'.
bump(base, "model", 1);

// 也可以用 as 直接过滤出这些属性
type PickByValue<T, V> = { [K in keyof T as T[K] extends V ? K : never]: T[K] };
const numbers: PickByValue<ChatSettings, number> = { temperature: 0.5, maxTokens: 1000 };
console.log(numbers);

// 可选属性：T[K] 带着 undefined，不算 number；同态映射又保留了 ?，读出来的值多了一个 undefined
interface SeededSettings extends ChatSettings {
  seed?: number;
}
type Loose = KeysOfType<SeededSettings, number>; // "temperature" | "maxTokens" | undefined
const looseKey: Loose = undefined; // 能编译：undefined 混进了"键"的联合
console.log(looseKey); // undefined

// 用 -? 去掉可选，undefined 就不会混进来
type KeysOfTypeStrict<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T];
type Strict = KeysOfTypeStrict<SeededSettings, number>; // "temperature" | "maxTokens"
// @ts-expect-error -- Type 'undefined' is not assignable to type 'Strict'.
const strictKey: Strict = undefined;
console.log(strictKey);

// ── 递归的条件类型 ───────────────────────────────────────────────
type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T // 函数保持原样
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T; // string、number 等基本类型本来就不可变

interface AgentConfig {
  model: { name: string; temperature: number };
  tools: { name: string; enabled: boolean }[];
  onEvent: (name: string) => void;
}
const config: DeepReadonly<AgentConfig> = {
  model: { name: "gpt-5", temperature: 0.7 },
  tools: [{ name: "search", enabled: true }],
  onEvent: (name) => console.log("event:", name),
};
config.onEvent("start"); // event: start
function neverCalled(): void {
  // @ts-expect-error -- Cannot assign to 'temperature' because it is a read-only property.
  config.model.temperature = 1;
  // @ts-expect-error -- Property 'push' does not exist on type 'readonly { readonly name: string; readonly enabled: boolean; }[]'.
  config.tools.push({ name: "shell", enabled: true });
}
void neverCalled;

// ── 条件类型做返回类型：调用方很舒服，实现里却需要断言 ───────────────
type Parsed<K extends "number" | "boolean"> = K extends "number" ? number : boolean;

function parseAs<K extends "number" | "boolean">(text: string, kind: K): Parsed<K> {
  // 即使检查了 kind 的值，TS 也不会因此去收窄类型参数 K，所以只能断言
  return (kind === "number" ? Number(text) : text === "true") as Parsed<K>;
}
const port = parseAs("8080", "number"); // number
const verbose = parseAs("true", "boolean"); // boolean
console.log(port + 1, !verbose); // 8081 false

function parseAsUnchecked<K extends "number" | "boolean">(text: string, kind: K): Parsed<K> {
  // @ts-expect-error -- Type 'number' is not assignable to type 'Parsed<K>'.（boolean 那一半也报同样的错）
  return kind === "number" ? Number(text) : text === "true";
}
void parseAsUnchecked;

// ── 泛型函数内部，条件类型无法化简 ─────────────────────────────────
interface UsageRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
}
const usages: UsageRecord[] = [
  { model: "gpt-5", inputTokens: 120, outputTokens: 30 },
  { model: "gpt-5", inputTokens: 80, outputTokens: 50 },
];

function sumFieldWrong<T>(items: readonly T[], key: KeysOfType<T, number>): number {
  let total = 0;
  for (const item of items) {
    // @ts-expect-error -- Operator '+=' cannot be applied to types 'number' and 'T[KeysOfType<T, number>]'.
    total += item[key]; // T 还不知道是什么，TS 无法确定 T[那个键] 是 number
  }
  return total;
}
void sumFieldWrong;

// 换个方向写约束：不是"T 里值为 number 的键 K"，而是"在 K 上值为 number 的对象"
function sumField<K extends PropertyKey>(items: readonly Record<K, number>[], key: K): number {
  let total = 0;
  for (const item of items) {
    total += item[key]; // ✅ Record<K, number>[K] 就是 number
  }
  return total;
}
console.log(sumField(usages, "inputTokens")); // 200
// @ts-expect-error -- Argument of type 'UsageRecord[]' is not assignable to parameter of type 'readonly Record<"model", number>[]'.
sumField(usages, "model");
