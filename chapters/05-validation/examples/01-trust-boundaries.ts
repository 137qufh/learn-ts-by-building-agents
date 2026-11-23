// 5.1 信任边界：类型只在编译期存在
// 运行：pnpm tsx chapters/05-validation/examples/01-trust-boundaries.ts

interface Usage {
  inputTokens: number;
  outputTokens: number;
}

// ── 1. as 不检查任何东西 ─────────────────────────────────────────────
// 某个兼容接口返回的字段名和你以为的不一样（真实世界里很常见）
const body = '{"prompt_tokens": 12, "completion_tokens": 30}';
const usage = JSON.parse(body) as Usage; // 编译通过：as 只是告诉编译器"相信我"

const total = usage.inputTokens + usage.outputTokens;
console.log("总 token：", total); // 总 token： NaN
// 没有报错，没有崩溃，只是一个 NaN 悄悄流进了费用统计。真正出问题的地方离这里很远

// ── 2. 环境变量永远是字符串 ──────────────────────────────────────────
process.env.MAX_RETRIES = "3";
const maxRetries = process.env.MAX_RETRIES ?? 2; // 类型是 string | 2，很容易被当成数字
console.log("最多尝试：", maxRetries + 1, "次"); // 最多尝试： 31 次

// ── 3. 类型谓词也可以撒谎 ────────────────────────────────────────────
function isUsageWrong(value: unknown): value is Usage {
  return typeof value === "object" && value !== null; // 只检查了一半，编译器不会发现
}
const parsed: unknown = JSON.parse(body);
if (isUsageWrong(parsed)) {
  console.log("谓词说它是 Usage：", parsed.inputTokens); // 谓词说它是 Usage： undefined
}

// ── 4. 手写一个正确的检查：每个字段都要看 ────────────────────────────
function parseUsage(value: unknown): Usage | string {
  if (typeof value !== "object" || value === null) {
    return "不是对象";
  }
  if (!("inputTokens" in value) || typeof value.inputTokens !== "number") {
    return "inputTokens 应该是数字";
  }
  if (!("outputTokens" in value) || typeof value.outputTokens !== "number") {
    return "outputTokens 应该是数字";
  }
  // 返回一个新对象，只带上检查过的字段
  return { inputTokens: value.inputTokens, outputTokens: value.outputTokens };
}
console.log(parseUsage(JSON.parse(body))); // inputTokens 应该是数字
console.log(parseUsage({ inputTokens: 1, outputTokens: 2, extra: "x" })); // { inputTokens: 1, outputTokens: 2 }
// 两个字段就写了 10 行。消息类型有十几个字段、好几层嵌套时，这样写既累又容易漏

// ── 5. schema：一个描述类型的值 ──────────────────────────────────────
// 把"怎么检查一个字段"做成可以组合的小零件，类型从零件的类型推导出来。练习 5-1 会写一个完整的版本
interface Schema<T> {
  parse(input: unknown): T | undefined; // 简化版：失败时返回 undefined
}
type Infer<S> = S extends Schema<infer T> ? T : never;

const num: Schema<number> = {
  parse: (input) => (typeof input === "number" ? input : undefined),
};
function object<S extends Record<string, Schema<unknown>>>(
  shape: S,
): Schema<{ [K in keyof S]: Infer<S[K]> }> {
  return {
    parse(input) {
      if (typeof input !== "object" || input === null) return undefined;
      const result: Record<string, unknown> = {};
      for (const [key, schema] of Object.entries(shape)) {
        const value = schema.parse((input as Record<string, unknown>)[key]);
        if (value === undefined) return undefined;
        result[key] = value;
      }
      return result as { [K in keyof S]: Infer<S[K]> };
    },
  };
}

const UsageSchema = object({ inputTokens: num, outputTokens: num });
type UsageFromSchema = Infer<typeof UsageSchema>; // { inputTokens: number; outputTokens: number }
const checked: UsageFromSchema | undefined = UsageSchema.parse(JSON.parse(body));
console.log("schema 的结果：", checked); // schema 的结果： undefined
console.log(UsageSchema.parse({ inputTokens: 5, outputTokens: 7 })); // { inputTokens: 5, outputTokens: 7 }
