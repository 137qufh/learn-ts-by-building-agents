/**
 * 练习 5-3 参考答案：从环境变量读取配置
 */
import { z } from "zod";

export type Env = Record<string, string | undefined>;

/** 空字符串和只有空白的值当作没设置：`OPENAI_MODEL= ` 和不写这一行是一个意思。 */
function blankToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

/** 一个可以为空、有默认值的整数。先去掉空白值，再 coerce：否则空字符串会被 Number("") 变成 0。 */
function intVar(defaultValue: number, min: number, max: number) {
  return z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(min).max(max).default(defaultValue),
  );
}

export const ApiKey = z.string().brand<"ApiKey">();
export type ApiKey = z.infer<typeof ApiKey>;

const EnvSchema = z.object({
  OPENAI_API_KEY: z.preprocess(
    blankToUndefined,
    z.string({ error: "必须设置" }).trim().pipe(ApiKey),
  ),
  OPENAI_MODEL: z.preprocess(blankToUndefined, z.string({ error: "必须设置" }).trim()),
  OPENAI_BASE_URL: z.preprocess(
    blankToUndefined,
    z
      // z.url() 默认接受任何协议，连 "localhost:3000" 都会被当成协议为 localhost 的 URL，所以限定协议
      .url({ protocol: /^https?$/, error: "必须是 http 或 https 开头的 URL" })
      .default("https://api.openai.com/v1")
      .transform((url) => url.replace(/\/+$/, "")),
  ),
  AGENT_MAX_RETRIES: intVar(3, 0, 10),
  AGENT_TIMEOUT_MS: intVar(60_000, 1, 600_000),
  AGENT_DEBUG: z.preprocess(blankToUndefined, z.stringbool().default(false)),
});

export interface Config {
  apiKey: ApiKey;
  model: string;
  baseUrl: string;
  maxRetries: number;
  timeoutMs: number;
  debug: boolean;
}

export type ConfigResult = { ok: true; config: Config } | { ok: false; errors: string[] };

export function loadConfig(env: Env): ConfigResult {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    return {
      ok: false,
      // issue 的 message 不会包含输入的值，所以 API key 不会出现在错误信息里
      errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }
  const data = result.data;
  return {
    ok: true,
    config: {
      apiKey: data.OPENAI_API_KEY,
      model: data.OPENAI_MODEL,
      baseUrl: data.OPENAI_BASE_URL,
      maxRetries: data.AGENT_MAX_RETRIES,
      timeoutMs: data.AGENT_TIMEOUT_MS,
      debug: data.AGENT_DEBUG,
    },
  };
}

export function maskKey(key: ApiKey): string {
  return key.length <= 8 ? "****" : `${key.slice(0, 3)}…${key.slice(-4)}`;
}

export function describeConfig(config: Config): string {
  return [
    `模型：${config.model}`,
    `地址：${config.baseUrl}`,
    `API key：${maskKey(config.apiKey)}`,
    `重试：${config.maxRetries} 次，超时：${config.timeoutMs}ms`,
    `调试：${config.debug ? "开" : "关"}`,
  ].join("\n");
}
