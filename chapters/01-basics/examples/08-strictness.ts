// 运行：pnpm tsx chapters/01-basics/examples/08-strictness.ts
// 配套课程：1.8 严格模式
//
// 本文件的每个 @ts-expect-error 都对应一个具体的编译选项。
// 想看看关掉它们会怎样？临时修改 tsconfig.json，再运行 pnpm typecheck。

// ── noImplicitAny：不允许悄悄推断出 any ─────────────────────────────
// @ts-expect-error -- Parameter 'text' implicitly has an 'any' type.
function shout(text) {
  return text.toUpperCase();
}
void shout;

// ── strictNullChecks：null / undefined 不能冒充其他类型 ─────────────
function findUser(id: number): string | undefined {
  return id === 1 ? "Ada" : undefined;
}
function greetUser(id: number): string {
  const user = findUser(id);
  // @ts-expect-error -- 'user' is possibly 'undefined'.
  return `你好，${user.toUpperCase()}`;
}
void greetUser;

// ── strictFunctionTypes：函数参数类型要"能接住所有可能的输入" ─────────
type Handler = (input: string | number) => void;
const handleStringOnly = (input: string) => console.log(input.toUpperCase());
// @ts-expect-error -- Type '(input: string) => void' is not assignable to type 'Handler'.
const handler: Handler = handleStringOnly; // 如果允许，handler(42) 就会在运行时崩溃
void handler;

// ── useUnknownInCatchVariables：catch 的变量是 unknown（见 1.7 节） ──
try {
  JSON.parse("{");
} catch (error) {
  // @ts-expect-error -- 'error' is of type 'unknown'.
  console.log(error.message.length > 0 ? "解析失败" : "");
}

// ── strictPropertyInitialization：类的属性必须初始化（类在后面的章节讲） ─
class Session {
  // @ts-expect-error -- Property 'id' has no initializer and is not definitely assigned in the constructor.
  id: string;
  model = "gpt-5"; // ✅ 有初始值
}
void Session;

// ════════════════ 以下选项不在 strict 里，是本仓库额外开启的 ════════════════

// ── noUncheckedIndexedAccess：下标访问可能越界（见 1.3 节） ──────────
const queue: string[] = [];
const head = queue[0]; // string | undefined
console.log(head?.length ?? "队列为空"); // 队列为空

// ── exactOptionalPropertyTypes：可选 ≠ 可以是 undefined ─────────────
interface RequestOptions {
  temperature?: number;
}
const omitted: RequestOptions = {}; // ✅ 没有这个属性
const explicit: RequestOptions = { temperature: 0.5 }; // ✅
// @ts-expect-error -- Type '{ temperature: undefined; }' is not assignable to type 'RequestOptions' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
const undefinedValue: RequestOptions = { temperature: undefined };
console.log("temperature" in omitted, "temperature" in undefinedValue, explicit); // false true { temperature: 0.5 }

// 有条件地设置可选属性：展开一个可能为空的对象
function buildOptions(temperature: number | undefined): RequestOptions {
  return { ...(temperature === undefined ? {} : { temperature }) };
}
console.log(buildOptions(undefined), buildOptions(0)); // {} { temperature: 0 }

// 如果你确实想允许显式的 undefined，就把它写进类型里
interface PatchOptions {
  temperature?: number | undefined;
}
const patch: PatchOptions = { temperature: undefined }; // ✅
console.log(patch); // { temperature: undefined }

// ── noImplicitReturns：每条路径都要返回值 ───────────────────────────
// @ts-expect-error -- Not all code paths return a value.
function sign(n: number): string | undefined {
  if (n > 0) return "+";
  if (n < 0) return "-";
}
void sign;

// ── noFallthroughCasesInSwitch：case 不能"掉"进下一个 case ──────────
function priority(level: "low" | "high"): number {
  let score = 0;
  switch (level) {
    // @ts-expect-error -- Fallthrough case in switch.
    case "high":
      score += 10; // 忘了 break，会继续执行下面 "low" 的代码
    case "low":
      score += 1;
      break;
  }
  return score;
}
console.log(priority("high")); // 11 —— 这就是 fallthrough 造成的 bug

// 多个 case 共享同一段代码（中间没有任何语句）是允许的
function isPositive(answer: "yes" | "y" | "no"): boolean {
  switch (answer) {
    case "yes":
    case "y":
      return true;
    case "no":
      return false;
  }
}
console.log(isPositive("y")); // true
