// 5.6 解析 API 响应
// 运行：pnpm tsx chapters/05-validation/examples/06-api-responses.ts

import { z } from "zod";

// ── 1. 宽容地读：只检查用到的字段 ────────────────────────────────────
// 服务商随时会加字段。z.object 忽略不认识的键，所以新字段不会让解析失败
const Usage = z.object({ prompt_tokens: z.number().int(), completion_tokens: z.number().int() });
const fromDeepSeek = {
  prompt_tokens: 100,
  completion_tokens: 20,
  total_tokens: 120,
  prompt_cache_hit_tokens: 64,
};
console.log(Usage.parse(fromDeepSeek)); // { prompt_tokens: 100, completion_tokens: 20 }

// ── 2. 封闭的枚举会被新值打破 ────────────────────────────────────────
const Closed = z.enum(["stop", "length", "tool_calls"]);
console.log(Closed.safeParse("insufficient_system_resource").success); // false ← 整个响应都失败了

// 认识的值保留，其他值归为 "other"
const FinishReason = Closed.or(z.string().transform(() => "other" as const));
console.log(FinishReason.parse("stop"), FinishReason.parse("insufficient_system_resource")); // stop other

// 只在类型上开放：string & {} 让编辑器仍然能补全认识的值
type OpenFinishReason = "stop" | "length" | "tool_calls" | (string & {});
const reason: OpenFinishReason = "content_filter"; // 不报错
console.log(reason);

// ── 3. 缺少和 null ───────────────────────────────────────────────────
// 有的服务商省略字段，有的写 null：nullish 两种都接受
const Delta = z.object({ content: z.string().nullish() });
console.log(Delta.parse({}), Delta.parse({ content: null }), Delta.parse({ content: "hi" })); // {} { content: null } { content: 'hi' }

// ── 4. 同一个字段的两种形状：字符串，或者一组内容块 ──────────────────
const TextPart = z.object({ type: z.literal("text"), text: z.string() });
const OtherPart = z.object({ type: z.string() }); // 图片、音频……这里不关心
const Content = z
  .union([z.string(), z.array(z.union([TextPart, OtherPart])), z.null()])
  .transform((content) => {
    if (content === null || typeof content === "string") {
      return content ?? "";
    }
    return content.map((part) => ("text" in part ? part.text : "")).join("");
  });
console.log(Content.parse("你好")); // 你好
console.log(
  Content.parse([
    { type: "text", text: "你" },
    { type: "image_url" },
    { type: "text", text: "好" },
  ]),
); // 你好
console.log(JSON.stringify(Content.parse(null))); // ""

// ── 5. 错误响应：解析失败也不能掩盖原来的错误 ────────────────────────
const ErrorBody = z.object({ error: z.object({ message: z.string() }) });
function describeError(status: number, bodyText: string): string {
  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    json = undefined;
  }
  const body = ErrorBody.safeParse(json);
  // 服务商的错误格式不对时，退回到状态码和原始文本，而不是抛出一个「解析错误」
  return body.success
    ? `${status}：${body.data.error.message}`
    : `${status}：${bodyText.slice(0, 100)}`;
}
console.log(describeError(429, '{"error":{"message":"Rate limit reached","type":"requests"}}')); // 429：Rate limit reached
console.log(describeError(502, "<html>Bad Gateway</html>")); // 502：<html>Bad Gateway</html>

// ── 6. 性能：解析本身很快，但要知道代价 ──────────────────────────────
const Chunk = z.object({
  choices: z
    .array(z.object({ delta: Delta.nullish(), finish_reason: FinishReason.nullish() }))
    .default([]),
});
const data = JSON.stringify({ choices: [{ delta: { content: "字" }, finish_reason: null }] });
const start = performance.now();
for (let i = 0; i < 10_000; i++) {
  Chunk.parse(JSON.parse(data));
}
const perChunk = ((performance.now() - start) / 10_000) * 1000;
// 每个块（JSON.parse + 校验）几微秒；而网络上等一个 token 要几十毫秒，差了上千倍
console.log(`每个块 ${perChunk.toFixed(1)} 微秒`); // 每个块 1.7 微秒（取决于机器）
