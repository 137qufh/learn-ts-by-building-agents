// 运行：pnpm tsx chapters/02-advanced-types/examples/01-generics.ts
// 配套课程：2.1 泛型

// ── 问题：不用泛型，要么丢掉类型，要么写很多遍 ─────────────────────
function firstAny(items: readonly any[]): any {
  return items[0];
}
const model = firstAny(["gpt-5", "claude"]); // any —— 类型信息丢了
function neverCalled(): void {
  model.toFixed(2); // 不报错！但运行时会抛 TypeError：model.toFixed is not a function
}
void neverCalled;

// ── 泛型函数：T 是"类型参数"，调用时由 TS 推断 ─────────────────────
function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}
const firstModel = first(["gpt-5", "claude"]); // string | undefined
const firstTokens = first([1024, 2048]); // number | undefined
console.log(firstModel, firstTokens); // gpt-5 1024
// @ts-expect-error -- Argument of type 'string | undefined' is not assignable to parameter of type 'number'.
Math.round(firstModel);

// 也可以手动指定类型参数，通常只在推断不出来时才需要
const none = first<string>([]); // string | undefined
console.log(none); // undefined

// ── 多个类型参数 ─────────────────────────────────────────────────
function mapValues<V, R>(record: Record<string, V>, fn: (value: V) => R): Record<string, R> {
  const result: Record<string, R> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = fn(value);
  }
  return result;
}
const lengths = mapValues({ system: "你是助手", user: "你好" }, (text) => text.length); // Record<string, number>
console.log(lengths); // { system: 4, user: 2 }

// ── 约束：extends 规定 T 至少要有什么 ─────────────────────────────
interface HasId {
  id: string;
}
function indexById<T extends HasId>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item])); // 有约束，才能访问 item.id
}
const calls = indexById([
  { id: "call_1", name: "get_weather" },
  { id: "call_2", name: "search" },
]);
console.log(calls.get("call_2")?.name); // search —— 返回的仍是完整的类型，不只是 HasId

const noIds = [{ name: "no id" }];
// @ts-expect-error -- Argument of type '{ name: string; }[]' is not assignable to parameter of type 'readonly HasId[]'.
indexById(noIds);

// ── 泛型类型：interface 和 type 都可以有类型参数，也可以有默认值 ──────
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

const good: Result<number> = { ok: true, value: 42 }; // E 用默认值 Error
const bad: Result<number, string> = { ok: false, error: "timeout" };
console.log(good, bad);

// 你早就用过泛型类型了：
const history: Array<string> = ["hi"]; // 和 string[] 完全一样
const cache = new Map<string, number>(); // Map<K, V>
cache.set("gpt-5", 1);
console.log(history.length, cache.size); // 1 1

// ── 推断不出来的类型参数会变成 unknown ─────────────────────────────
function emptyList<T>(): T[] {
  return [];
}
const mystery = emptyList(); // unknown[]
const names = emptyList<string>(); // string[]
console.log(mystery, names); // [] []

// ── 反模式：类型参数只出现一次，等于一个伪装起来的 as ──────────────────
function parseJson<T>(text: string): T {
  return JSON.parse(text); // JSON.parse 返回 any，所以这里不报错
}
const parsed = parseJson<{ city: string }>('{"town": "北京"}'); // 类型说有 city，实际没有
console.log(parsed.city); // undefined —— 类型撒了谎

// ── const 类型参数：保留字面量类型 ─────────────────────────────────
function toolNames<T extends readonly string[]>(names: T): T {
  return names;
}
const loose = toolNames(["search", "read_file"]); // string[]

function toolNamesConst<const T extends readonly string[]>(names: T): T {
  return names;
}
const exact = toolNamesConst(["search", "read_file"]); // readonly ["search", "read_file"]
console.log(loose, exact);

// ── NoInfer：指定"别从这个参数推断" ───────────────────────────────
function pickModel<M extends string>(models: readonly M[], fallback: M): M {
  return models[0] ?? fallback;
}
pickModel(["gpt-5", "claude"], "gemini"); // 不报错！M 被推断成 "gpt-5" | "claude" | "gemini"

function pickModelStrict<M extends string>(models: readonly M[], fallback: NoInfer<M>): M {
  return models[0] ?? fallback;
}
console.log(pickModelStrict(["gpt-5", "claude"], "claude")); // gpt-5
// @ts-expect-error -- Argument of type '"gemini"' is not assignable to parameter of type '"claude" | "gpt-5"'.
pickModelStrict(["gpt-5", "claude"], "gemini");
