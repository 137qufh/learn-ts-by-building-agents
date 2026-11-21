// 运行：pnpm tsx chapters/01-basics/examples/07-any-unknown-never.ts
// 配套课程：1.7 any、unknown 与 never

// ── any：关闭类型检查 ─────────────────────────────────────────────
const anything: any = JSON.parse('{"text": "hi"}'); // JSON.parse 返回 any
// anything.foo.bar() 也能编译通过，但运行时会崩溃，见文件末尾的演示
const n: number = anything; // ✅ 也通过：any 可以赋值给任何类型

// any 会"传染"：从 any 上取到的任何东西也都是 any
const text = anything.text; // any
const upper = text.toUpperCase(); // any，就算 text 根本不是字符串也不会报错
console.log(upper, n); // HI { text: 'hi' } —— n 被声明为 number，实际上是个对象

// ── unknown：类型安全的"不知道" ──────────────────────────────────
const data: unknown = JSON.parse('{"text": "hi"}');
// @ts-expect-error -- 'data' is of type 'unknown'.
data.text;

// 必须先收窄，才能使用
function readText(value: unknown): string | undefined {
  if (typeof value === "object" && value !== null && "text" in value) {
    // 到这里 value 的类型是 object & Record<"text", unknown>，value.text 依然是 unknown
    return typeof value.text === "string" ? value.text : undefined;
  }
  return undefined;
}
console.log(readText(data), readText(42), readText(null)); // hi undefined undefined

// ── catch 到的错误是 unknown ──────────────────────────────────────
function riskyCall(): never {
  throw new Error("连接超时");
}

try {
  riskyCall();
} catch (error) {
  // error 的类型是 unknown：JavaScript 允许 throw 任何值，不一定是 Error
  console.log(error instanceof Error ? error.message : String(error)); // 连接超时
}

try {
  throw "一个字符串"; // 合法的 JavaScript，虽然是坏习惯
} catch (error) {
  console.log(error instanceof Error ? error.message : String(error)); // 一个字符串
}

// ── never：不可能存在的值 ─────────────────────────────────────────
// 1. 永远不会正常返回的函数
function fail(message: string): never {
  throw new Error(message);
}

function parsePositive(text: string): number {
  const value = Number(text);
  if (Number.isNaN(value) || value <= 0) fail(`不是正数：${text}`);
  return value; // fail 返回 never，TS 知道走到这里时 value 一定是合法的
}
console.log(parsePositive("3")); // 3

// 2. 收窄到穷尽之后剩下的类型（见 1.6 节的 assertNever）
function check(x: string | number) {
  if (typeof x === "string") return "string";
  if (typeof x === "number") return "number";
  const impossible: never = x; // ✅ 两种情况都排除了，x 是 never
  return impossible;
}
console.log(check("a"), check(1)); // string number

// 3. 不可能满足的类型
type Impossible = string & number; // never
// @ts-expect-error -- Type '"a"' is not assignable to type 'never'.
const nope: Impossible = "a";
void nope;

// ── 类型断言 as：告诉编译器"相信我" ───────────────────────────────
interface Usage {
  inputTokens: number;
  outputTokens: number;
}
const asserted = JSON.parse('{"inputTokens": "oops"}') as Usage; // 编译通过，但这是一句谎话
console.log(typeof asserted.inputTokens); // string —— 断言不会做任何运行时检查

// 断言只允许在"有可能兼容"的类型之间进行
// @ts-expect-error -- Conversion of type 'string' to type 'number' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
const wrong = "42" as number;
void wrong;

// ── 非空断言 !：告诉编译器"这里一定不是 undefined" ─────────────────
const models = ["gpt-5"];
const firstModel = models[0]!; // string —— 我们"保证"数组不为空
console.log(firstModel); // gpt-5

// ── 演示 any 的危险：编译完全通过，运行时崩溃 ──────────────────────
function anyIsDangerous() {
  try {
    anything.foo.bar();
  } catch (error) {
    console.log("运行时崩溃：", error instanceof Error ? error.message : error);
  }
}
anyIsDangerous(); // 运行时崩溃： Cannot read properties of undefined (reading 'bar')
