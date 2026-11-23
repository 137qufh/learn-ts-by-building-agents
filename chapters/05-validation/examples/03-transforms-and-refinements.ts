// 5.3 转换与细化
// 运行：pnpm tsx chapters/05-validation/examples/03-transforms-and-refinements.ts

import { z } from "zod";

// ── 1. refine：类型表达不了的规则 ────────────────────────────────────
const Range = z
  .object({ min: z.number(), max: z.number() })
  .refine((range) => range.min <= range.max, { message: "min 不能大于 max", path: ["min"] });

const bad = Range.safeParse({ min: 5, max: 1 });
if (!bad.success) {
  console.log(bad.error.issues); // [ { code: 'custom', path: [ 'min' ], message: 'min 不能大于 max' } ]
}
// 字段本身不对时，对象上的 refine 不会运行：它的参数类型是 { min: number; max: number }，必须先保证这一点
const worse = Range.safeParse({ min: "5", max: 1 });
if (!worse.success) {
  console.log(worse.error.issues.map((issue) => issue.code)); // [ 'invalid_type' ]
}

// ── 2. superRefine：一次报告多个问题，自己决定 path ──────────────────
const ToolCalls = z
  .array(z.object({ id: z.string(), name: z.string() }))
  .superRefine((calls, ctx) => {
    const seen = new Set<string>();
    calls.forEach((call, index) => {
      if (seen.has(call.id)) {
        ctx.addIssue({ code: "custom", message: `重复的 id：${call.id}`, path: [index, "id"] });
      }
      seen.add(call.id);
    });
  });
const duplicated = ToolCalls.safeParse([
  { id: "a", name: "x" },
  { id: "a", name: "y" },
]);
if (!duplicated.success) {
  console.log(duplicated.error.issues[0]?.path, duplicated.error.issues[0]?.message); // [ 1, 'id' ] 重复的 id：a
}

// ── 3. transform：校验之后变换 ───────────────────────────────────────
const Csv = z.string().transform((text) => text.split(",").map((part) => part.trim()));
console.log(Csv.parse("search, read_file ,write_file")); // [ 'search', 'read_file', 'write_file' ]

// 变换时也可能失败：用 ctx.addIssue 报告，返回 z.NEVER
const JsonText = z.string().transform((text, ctx): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    ctx.addIssue({ code: "custom", message: "不是合法的 JSON" });
    return z.NEVER;
  }
});
console.log(JsonText.safeParse("{坏了").success); // false

// ── 4. pipe：把一个 schema 的输出交给另一个 schema ───────────────────
// 模型的工具参数是 JSON 字符串：先解析 JSON，再校验结构，一个 schema 完成
const WeatherArgs = JsonText.pipe(z.object({ city: z.string().min(1) }));
console.log(WeatherArgs.parse('{"city":"北京"}')); // { city: '北京' }
const noCity = WeatherArgs.safeParse('{"town":"北京"}');
if (!noCity.success) {
  console.log(noCity.error.issues[0]?.path); // [ 'city' ]
}

// ── 5. 输入类型和输出类型 ────────────────────────────────────────────
type WeatherInput = z.input<typeof WeatherArgs>; // string
type WeatherOutput = z.output<typeof WeatherArgs>; // { city: string }（z.infer 就是 z.output）
const raw: WeatherInput = '{"city":"上海"}';
const parsed: WeatherOutput = WeatherArgs.parse(raw);
console.log(parsed.city); // 上海

const WithDefault = z.object({ retries: z.number().int().default(3) });
type DefaultIn = z.input<typeof WithDefault>; // { retries?: number | undefined }
type DefaultOut = z.output<typeof WithDefault>; // { retries: number }
const before: DefaultIn = {};
const after: DefaultOut = WithDefault.parse(before);
console.log(after); // { retries: 3 }

// ── 6. coerce：方便，但要小心 ────────────────────────────────────────
const Num = z.coerce.number(); // 先 Number(input)，再校验
console.log(Num.parse("42"), Num.parse("1e3")); // 42 1000
console.log(Num.parse(""), Num.parse("  "), Num.parse(null)); // 0 0 0  ← Number("") 是 0
console.log(Num.safeParse("abc").success); // false：NaN 不算数字

// 环境变量的布尔值：z.stringbool 认识常见的写法，其他的报错（而 Boolean("false") 是 true）
const Flag = z.stringbool();
console.log(Flag.parse("yes"), Flag.parse("0"), Flag.safeParse("maybe").success); // true false false

// ── 7. 品牌类型：只有校验过的值才是这个类型 ──────────────────────────
const ToolCallId = z
  .string()
  .regex(/^call_\w+$/)
  .brand<"ToolCallId">();
type ToolCallId = z.infer<typeof ToolCallId>; // string & z.$brand<"ToolCallId">
function findResult(id: ToolCallId): string {
  return `结果 ${id}`;
}
console.log(findResult(ToolCallId.parse("call_1"))); // 结果 call_1
// @ts-expect-error 普通字符串不能冒充 ToolCallId：必须先经过 schema
findResult("call_1");

// ── 8. catch：校验失败时用一个兜底的值 ───────────────────────────────
const Temperature = z.number().min(0).max(2).catch(1);
console.log(Temperature.parse(5), Temperature.parse("热")); // 1 1
