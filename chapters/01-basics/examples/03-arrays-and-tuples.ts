// 运行：pnpm tsx chapters/01-basics/examples/03-arrays-and-tuples.ts
// 配套课程：1.3 数组与元组
//
// 约定：标了 @ts-expect-error 的代码在运行时依然会执行（类型检查不影响运行）。
// 如果某段错误示范在运行时会产生副作用，我们把它放进一个从不调用的函数里，只用来展示报错。

// ── 数组：T[] 或 Array<T> ─────────────────────────────────────────
const models: string[] = ["gpt-5", "claude-sonnet", "gemini-pro"];
const scores: Array<number> = [0.9, 0.75]; // 与 number[] 完全相同

function pushWrongType() {
  // @ts-expect-error -- Argument of type 'number' is not assignable to parameter of type 'string'.
  models.push(42);
}
void pushWrongType;

// 空数组要写类型，否则 TS 不知道里面会放什么
const history: string[] = [];
history.push("你好");

// ── 下标访问与 noUncheckedIndexedAccess ────────────────────────────
const first = models[0]; // string | undefined —— 数组可能是空的

function useWithoutCheck() {
  // @ts-expect-error -- 'first' is possibly 'undefined'.
  return first.toUpperCase();
}
void useWithoutCheck;

if (first !== undefined) {
  console.log(first.toUpperCase()); // ✅ 检查之后就是 string 了。输出：GPT-5
}
console.log(models[10]); // undefined —— 越界不会抛错，而是返回 undefined
console.log(models.at(-1)); // gemini-pro —— at(-1) 取最后一个元素，返回类型同样带 undefined

// for...of 和数组方法里拿到的元素就是 string，不带 undefined
for (const model of models) {
  console.log(model.length); // 5、13、10
}
const upper = models.map((m) => m.toUpperCase()); // string[]
console.log(upper, scores); // [ 'GPT-5', 'CLAUDE-SONNET', 'GEMINI-PRO' ] [ 0.9, 0.75 ]

// find 可能找不到，所以返回 string | undefined
const claude = models.find((m) => m.startsWith("claude"));
console.log(claude ?? "没找到"); // claude-sonnet

// filter 能自动推断出"过滤掉 undefined"（TypeScript 5.5 起）
const maybe: (string | undefined)[] = ["a", undefined, "b"];
const defined: string[] = maybe.filter((x) => x !== undefined); // ✅ 类型是 string[]
console.log(defined); // [ 'a', 'b' ]

// ── 只读数组 ──────────────────────────────────────────────────────
function lastMessage(messages: readonly string[]): string | undefined {
  return messages.at(-1);
}
console.log(lastMessage(history)); // 你好 —— 普通数组可以传给 readonly 参数

function mutateReadonly(messages: readonly string[]) {
  // @ts-expect-error -- Property 'push' does not exist on type 'readonly string[]'.
  messages.push("偷偷加一条");
}
void mutateReadonly;

const frozen: readonly string[] = ["a"];
// @ts-expect-error -- The type 'readonly string[]' is 'readonly' and cannot be assigned to the mutable type 'string[]'.
const mutable: string[] = frozen;
void mutable;

// ── 元组：长度固定、每个位置类型固定 ──────────────────────────────
const entry: [string, number] = ["gpt-5", 1.25];
const [modelName, price] = entry; // 解构：modelName 是 string，price 是 number
console.log(modelName, price); // gpt-5 1.25

function wrongTupleType() {
  // @ts-expect-error -- Type 'string' is not assignable to type 'number'.
  entry[1] = "free";
}
void wrongTupleType;

// 带标签的元组：标签只用于提示和文档，不影响类型
type ModelId = [provider: string, model: string];
const id: ModelId = ["anthropic", "claude-sonnet"];
console.log(id.join("/")); // anthropic/claude-sonnet

// 可选元素
type Range = [start: number, end?: number];
const open: Range = [10];
const closed: Range = [10, 20];
console.log(open.length, closed.length); // 1 2

// ── as const：把数组变成只读的字面量元组 ──────────────────────────
const mutableRoles = ["user", "assistant"]; // string[]
const roles = ["user", "assistant"] as const; // readonly ["user", "assistant"]
console.log(mutableRoles, roles); // [ 'user', 'assistant' ] [ 'user', 'assistant' ]

function pushToConst() {
  // @ts-expect-error -- Property 'push' does not exist on type 'readonly ["user", "assistant"]'.
  roles.push("tool");
}
void pushToConst;
