// 5.5 校验模型的输出
// 运行：pnpm tsx chapters/05-validation/examples/05-model-output.ts

import { z } from "zod";

// ── 1. 工具参数：一段 JSON 字符串，两步都可能失败 ────────────────────
const WeatherArgs = z.object({
  city: z.string().min(1, "city 不能为空"),
  unit: z.enum(["celsius", "fahrenheit"]).default("celsius"),
});

function runWeather(rawArguments: string): { content: string; isError?: true } {
  let json: unknown;
  try {
    json = JSON.parse(rawArguments);
  } catch (error) {
    return { content: `参数不是合法的 JSON：${(error as Error).message}`, isError: true };
  }
  const args = WeatherArgs.safeParse(json);
  if (!args.success) {
    return { content: `参数不符合要求：\n${z.prettifyError(args.error)}`, isError: true };
  }
  // 到这里 args.data 的类型是 { city: string; unit: "celsius" | "fahrenheit" }
  return { content: `${args.data.city}：晴，25 度（${args.data.unit}）` };
}

console.log(runWeather('{"city":"北京"}')); //                 { content: '北京：晴，25 度（celsius）' }
console.log(runWeather('{"city":"北京"')); //                  参数不是合法的 JSON：…
console.log(runWeather('{"city":"","unit":"kelvin"}').content);
// 参数不符合要求：
// ✖ city 不能为空
//   → at city
// ✖ Invalid option: expected one of "celsius"|"fahrenheit"
//   → at unit

// ── 2. 结构化输出：请求里带上 JSON Schema ────────────────────────────
// 严格模式要求 additionalProperties: false；io: "input" 时普通 z.object 不写它，所以用 strictObject（5.4 节）
const Plan = z.strictObject({
  goal: z.string().describe("一句话说明目标"),
  steps: z.array(z.string()).min(1).describe("按顺序执行的步骤"),
});
const body = {
  model: "gpt-5",
  messages: [{ role: "user", content: "帮我规划：给项目加上 ESLint" }],
  response_format: {
    type: "json_schema",
    json_schema: { name: "plan", strict: true, schema: z.toJSONSchema(Plan, { io: "input" }) },
  },
};
const { required, additionalProperties } = body.response_format.json_schema.schema;
console.log(JSON.stringify({ required, additionalProperties })); // {"required":["goal","steps"],"additionalProperties":false}

// ── 3. 就算用了严格模式，也要校验 ─────────────────────────────────────
// 被 max_tokens 截断的回答（finish_reason 是 "length"）：
const truncated = '{"goal":"加上 ESLint","steps":["安装依赖","写配';
const JsonText = z.string().transform((text, ctx): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    ctx.addIssue({ code: "custom", message: "回答不完整，不是合法的 JSON" });
    return z.NEVER;
  }
});
console.log(JsonText.pipe(Plan).safeParse(truncated).success); // false
// 其他原因：模型拒绝回答（refusal）、厂商不支持严格模式、schema 表达不了的规则（refine）……

// ── 4. 不支持严格模式的模型：回答里夹着文字和代码块 ──────────────────
const chatty = '好的！计划如下：\n```json\n{"goal":"加上 ESLint","steps":[]}\n```\n祝顺利！';
const fenced = /```(?:json)?\s*\n([\s\S]*?)```/i.exec(chatty)?.[1] ?? chatty;
const plan = Plan.safeParse(JSON.parse(fenced));
if (!plan.success) {
  // 把问题告诉模型，让它改：路径 + 信息，简短明确
  const feedback = plan.error.issues.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`);
  console.log(feedback.join("\n")); // - steps: Too small: expected array to have >=1 items
}

// ── 5. 修复循环：生成 → 校验 → 反馈 ──────────────────────────────────
// 用一个按脚本回答的假模型演示：第一次漏了步骤，看到反馈后改正
const replies = [
  '{"goal":"加上 ESLint","steps":[]}',
  '{"goal":"加上 ESLint","steps":["安装","配置","修复"]}',
];
let calls = 0;
async function fakeModel(_feedback: string | undefined): Promise<string> {
  return replies[calls++] ?? "";
}

let feedback: string | undefined;
for (let attempt = 1; attempt <= 3; attempt++) {
  const result = Plan.safeParse(JSON.parse(await fakeModel(feedback)));
  if (result.success) {
    console.log(`第 ${attempt} 次成功：`, result.data.steps); // 第 2 次成功： [ '安装', '配置', '修复' ]
    break;
  }
  feedback = z.prettifyError(result.error);
  console.log(`第 ${attempt} 次不合格，反馈给模型：${feedback.replaceAll("\n", " ")}`);
}
