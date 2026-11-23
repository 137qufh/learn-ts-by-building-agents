// 5.2 Zod 基础
// 运行：pnpm tsx chapters/05-validation/examples/02-zod-basics.ts

import { z } from "zod";

// ── 1. schema 和类型 ────────────────────────────────────────────────
const Usage = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
type Usage = z.infer<typeof Usage>; // { inputTokens: number; outputTokens: number }

// ── 2. parse 和 safeParse ───────────────────────────────────────────
const good: Usage = Usage.parse({ inputTokens: 12, outputTokens: 30 }); // 失败时抛出 ZodError
console.log(good); // { inputTokens: 12, outputTokens: 30 }

const result = Usage.safeParse({ prompt_tokens: 12, completion_tokens: 30 }); // 永远不抛出
if (result.success) {
  console.log(result.data.inputTokens);
} else {
  console.log(result.error.issues.length); // 2
  console.log(z.prettifyError(result.error));
  // ✖ Invalid input: expected number, received undefined
  //   → at inputTokens
  // ✖ Invalid input: expected number, received undefined
  //   → at outputTokens
}

// 每个 issue 是一个结构化的对象：code、path、message 和一些附加信息
const negative = Usage.safeParse({ inputTokens: -1, outputTokens: 1.5 });
if (!negative.success) {
  for (const issue of negative.error.issues) {
    console.log(issue.code, issue.path, issue.message);
  }
  // too_small [ 'inputTokens' ] Too small: expected number to be >=0
  // invalid_type [ 'outputTokens' ] Invalid input: expected int, received number
}

// ── 3. 对象：多余的键怎么处理 ────────────────────────────────────────
const input = { inputTokens: 1, outputTokens: 2, extra: "x" };
console.log(Usage.parse(input)); // { inputTokens: 1, outputTokens: 2 }：默认丢掉多余的键
console.log(Usage.parse(input) === input); // false：parse 返回一个新对象
console.log(z.strictObject(Usage.shape).safeParse(input).success); // false：多余的键算错误
console.log(z.looseObject(Usage.shape).parse(input)); // { inputTokens: 1, outputTokens: 2, extra: 'x' }

// ── 4. 可选、null 和 exactOptionalPropertyTypes ─────────────────────
const Optional = z.object({
  a: z.string().optional(), // a?: string | undefined
  b: z.string().exactOptional(), // b?: string        ← 和本仓库的 tsconfig 一致
  c: z.string().nullable(), // c: string | null
  d: z.string().nullish(), // d?: string | null | undefined
});
type Optional = z.infer<typeof Optional>;
const sample: Optional = { c: null };
console.log(Optional.parse(sample)); // { c: null }
console.log(Optional.safeParse({ a: undefined, c: null }).success); // true
console.log(Optional.safeParse({ b: undefined, c: null }).success); // false：键存在但值是 undefined

// ── 5. 字面量、枚举、可辨识联合 ──────────────────────────────────────
const Role = z.enum(["system", "user", "assistant", "tool"]);
type Role = z.infer<typeof Role>; // "system" | "user" | "assistant" | "tool"
console.log(Role.options); // [ 'system', 'user', 'assistant', 'tool' ]

const Event = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("tool_call"), name: z.string(), arguments: z.string() }),
  z.object({ type: z.literal("done") }),
]);
type Event = z.infer<typeof Event>;
const event: Event = Event.parse({ type: "text", text: "你好" });
if (event.type === "text") {
  console.log(event.text); // 你好：和手写的可辨识联合一样，可以收窄
}
const wrongType = Event.safeParse({ type: "image" });
if (!wrongType.success) {
  console.log(wrongType.error.issues[0]?.message); // Invalid discriminator value. Expected 'text' | 'tool_call' | 'done'
}
const missingField = Event.safeParse({ type: "tool_call", name: "search" });
if (!missingField.success) {
  console.log(missingField.error.issues[0]?.path); // [ 'arguments' ]：只报告匹配上的那个分支的问题
}

// ── 6. 数组、元组、记录 ─────────────────────────────────────────────
console.log(z.array(z.string()).min(1).safeParse([]).success); // false
console.log(z.tuple([z.string(), z.number()]).parse(["重试次数", 3])); // [ '重试次数', 3 ]
console.log(z.record(z.string(), z.number()).parse({ 北京: 25, 上海: 28 })); // { '北京': 25, '上海': 28 }
const Args = z.record(z.string(), z.unknown()); // 工具参数：先确认是对象，具体结构交给每个工具
console.log(Args.safeParse([1, 2]).success); // false：数组不是记录

// ── 7. 组合已有的 schema ─────────────────────────────────────────────
const WithCache = Usage.extend({ cachedInputTokens: z.number().int().exactOptional() });
const OnlyInput = WithCache.pick({ inputTokens: true });
const Patch = WithCache.partial(); // 所有键都变成可选
type Patch = z.infer<typeof Patch>;
const patch: Patch = {};
console.log(OnlyInput.parse({ inputTokens: 1, outputTokens: 2 }), patch); // { inputTokens: 1 } {}

// ── 8. 自定义错误信息 ───────────────────────────────────────────────
const City = z
  .string({ error: "城市名必须是字符串" })
  .min(1, "城市名不能为空")
  .describe("城市名，例如“北京”"); // describe 不影响校验，会出现在 JSON Schema 里（5.4 节）
const emptyCity = City.safeParse("");
if (!emptyCity.success) {
  console.log(emptyCity.error.issues[0]?.message); // 城市名不能为空
}
const numberCity = City.safeParse(42);
if (!numberCity.success) {
  console.log(numberCity.error.issues[0]?.message); // 城市名必须是字符串
}
