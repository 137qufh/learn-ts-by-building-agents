// 运行：pnpm tsx chapters/01-basics/examples/04-functions.ts
// 配套课程：1.4 函数

// ── 两种写法：函数声明与箭头函数 ──────────────────────────────────
function add(a: number, b: number): number {
  return a + b;
}
const multiply = (a: number, b: number): number => a * b;
console.log(add(1, 2), multiply(3, 4)); // 3 12

// 参数个数也会检查
// @ts-expect-error -- Expected 2 arguments, but got 1.
add(1);

// ── 返回类型可以推断，但导出的函数建议写出来 ──────────────────────
function makeGreeting(name: string) {
  return `你好，${name}`; // 推断返回 string
}
console.log(makeGreeting("Ada")); // 你好，Ada

// 写了返回类型，函数内部写错时错误就报在这里，而不是报在调用方
function parsePort(text: string): number {
  const port = Number(text);
  // @ts-expect-error -- Type 'string' is not assignable to type 'number'.
  if (Number.isNaN(port)) return "invalid";
  return port;
}
console.log(parsePort("8080")); // 8080

// ── 可选参数、默认值、剩余参数 ────────────────────────────────────
function truncate(text: string, maxLength = 20, suffix?: string): string {
  // maxLength 的类型从默认值推断为 number；suffix 的类型是 string | undefined
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + (suffix ?? "…");
}
console.log(truncate("TypeScript is a typed superset of JavaScript")); // TypeScript is a type…
console.log(truncate("TypeScript is a typed superset of JavaScript", 10, "...")); // TypeScript...

function joinLines(...lines: string[]): string {
  return lines.join("\n");
}
console.log(joinLines("第一行", "第二行"));

// ── 参数多了就用"选项对象"，配合解构和默认值 ──────────────────────
interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

function describeRequest(prompt: string, options: CompletionOptions = {}): string {
  const { model = "gpt-5", temperature = 1, maxTokens = 1024 } = options;
  return `${model} (t=${temperature}, max=${maxTokens}): ${prompt}`;
}
console.log(describeRequest("讲个笑话")); // gpt-5 (t=1, max=1024): 讲个笑话
console.log(describeRequest("讲个笑话", { temperature: 0 })); // gpt-5 (t=0, max=1024): 讲个笑话

// 选项对象同样享受多余属性检查：拼错的参数名当场被发现
// @ts-expect-error -- Object literal may only specify known properties, but 'maxToken' does not exist in type 'CompletionOptions'. Did you mean to write 'maxTokens'?
describeRequest("hi", { maxToken: 10 });

// ── 函数类型 ──────────────────────────────────────────────────────
type Transform = (text: string) => string;

const shout: Transform = (text) => text.toUpperCase(); // text 的类型由 Transform 推断出来
const trim: Transform = (text) => text.trim();

function pipeline(text: string, steps: readonly Transform[]): string {
  let result = text;
  for (const step of steps) result = step(result);
  return result;
}
console.log(pipeline("  hello agent  ", [trim, shout])); // HELLO AGENT

// ── 上下文类型：回调函数的参数不用写类型 ──────────────────────────
const lengths = ["a", "bb", "ccc"].map((s) => s.length); // s 自动推断为 string
console.log(lengths); // [ 1, 2, 3 ]

// ── void：不关心返回值 ────────────────────────────────────────────
function log(message: string): void {
  console.log(`[log] ${message}`);
}
log("done"); // [log] done

// 一个容易让人意外的规则：类型为"返回 void 的函数"的位置，可以放一个有返回值的函数。
// 这是为了让 forEach(x => arr.push(x)) 这样的写法能通过（push 返回数字）。
type Callback = () => void;
const callback: Callback = () => 42; // ✅ 返回值会被忽略
console.log(callback()); // 42 —— 运行时值还在，但类型是 void，你不应该使用它

// ── 函数是值：可以作为参数传入，也可以被返回 ──────────────────────
function makeCounter(start = 0): () => number {
  let count = start;
  return () => {
    count += 1;
    return count;
  };
}
const next = makeCounter();
console.log(next(), next(), next()); // 1 2 3
