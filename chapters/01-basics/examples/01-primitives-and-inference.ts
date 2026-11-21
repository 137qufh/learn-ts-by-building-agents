// 运行：pnpm tsx chapters/01-basics/examples/01-primitives-and-inference.ts
// 配套课程：1.1 基本类型与类型推断

// ── 类型标注：变量名后面写 `: 类型` ───────────────────────────────
const model: string = "gpt-5";
const temperature: number = 0.7; // 整数和小数都是 number
const stream: boolean = true;

console.log(model, temperature, stream); // gpt-5 0.7 true

// ── 类型推断：大多数时候不用写，TS 会根据初始值推断 ──────────────
let maxTokens = 1024; // 推断为 number（在编辑器里把鼠标悬停在变量名上就能看到）
maxTokens = 2048; // ✅
// @ts-expect-error -- Type 'string' is not assignable to type 'number'.
maxTokens = "a lot";

// ── let 和 const 推断出的类型不同 ─────────────────────────────────
let provider = "openai"; // let 以后可能改成别的字符串，所以推断为 string
const role = "user"; // const 永远不会变，所以推断为字面量类型 "user"（1.5 节细讲）
provider = "anthropic"; // ✅
console.log(provider, role); // anthropic user

// ── number：只有一种数字类型 ──────────────────────────────────────
console.log(0.1 + 0.2); // 0.30000000000000004 —— 和其他语言的 double 一样
console.log(Number.isInteger(42), Number.isInteger(4.2)); // true false
console.log(Number("abc")); // NaN —— 转换失败不会报错，而是得到 NaN（它的类型也是 number）

// ── bigint：任意精度整数，字面量以 n 结尾 ─────────────────────────
const big: bigint = 2n ** 64n;
console.log(big); // 18446744073709551616n

// ── null 和 undefined ────────────────────────────────────────────
// undefined：没有值 / 不存在（未赋值的变量、不存在的属性、没有 return 的函数）
// null：明确地"空"
// 在 strict 模式下，它们不能赋值给其他类型，除非你明确写出来：
let nickname: string | null = null; // `|` 表示"或"，1.6 节细讲
nickname = "Ada";
// @ts-expect-error -- Type 'null' is not assignable to type 'string'.
const title: string = null;

console.log(nickname, title); // Ada null —— 类型被擦除了，运行时 title 确实是 null

// ── 什么时候该写类型标注？ ────────────────────────────────────────
// 1. 函数参数：必须写，TS 没法从函数体推断出调用者会传什么
// 2. 导出的函数的返回值：推荐写，它是函数对外的"合同"
// 3. 声明时没有初始值的变量
function estimateCost(inputTokens: number, pricePerMillion: number): number {
  return (inputTokens / 1_000_000) * pricePerMillion; // 数字里的 _ 只是分隔符，方便阅读
}
console.log(estimateCost(250_000, 2.5)); // 0.625

let lastError: string | undefined; // 先声明，以后再赋值；没赋值之前它是 undefined
console.log(lastError); // undefined
