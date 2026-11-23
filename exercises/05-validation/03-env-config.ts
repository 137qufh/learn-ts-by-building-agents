/**
 * 练习 5-3：从环境变量读取配置
 *
 * 课程：chapters/05-validation/03-transforms-and-refinements.md
 * 运行：pnpm ex 03-env-config
 *
 * agent 启动时从环境变量读取配置。环境变量全是字符串，可能没设置、可能是空字符串、可能有多余的空白。
 * 用 Zod 把 process.env 解析成一个类型正确的 Config：
 *
 *   环境变量             Config 字段   规则
 *   OPENAI_API_KEY       apiKey        必填，去掉首尾空白，类型是 ApiKey（品牌类型）
 *   OPENAI_MODEL         model         必填，去掉首尾空白
 *   OPENAI_BASE_URL      baseUrl       默认 "https://api.openai.com/v1"；必须是 http 或 https 的 URL；去掉末尾的 "/"
 *   AGENT_MAX_RETRIES    maxRetries    默认 3；0 到 10 的整数
 *   AGENT_TIMEOUT_MS     timeoutMs     默认 60000；1 到 600000 的整数
 *   AGENT_DEBUG          debug         默认 false；"true"/"false"、"1"/"0"、"yes"/"no" 等（z.stringbool）
 *
 * 通用规则：
 * - 空字符串和只有空白的值，当作没有设置（用默认值；必填的报错）
 * - 必填的变量没有设置时，错误信息是 "必须设置"
 * - URL 不合法时，错误信息是 "必须是 http 或 https 开头的 URL"
 * - 其他错误用 Zod 默认的信息即可
 * - 所有问题一次报告完，每条的格式是 `${环境变量名}: ${信息}`
 * - 错误信息里绝不能出现 API key 的值
 *
 * 提示：z.preprocess、z.coerce、.default、.transform、.pipe、z.stringbool、z.url 的 protocol 选项。
 * 小心 z.coerce.number() 会把空字符串变成 0。
 */
import { z } from "zod";
import { todo } from "../todo.ts";

export type Env = Record<string, string | undefined>;

/** 品牌类型（5.3 节）：只有经过校验的字符串才是 ApiKey，普通的 string 不能直接赋值给它。 */
export const ApiKey = z.string().brand<"ApiKey">();
export type ApiKey = z.infer<typeof ApiKey>;

export interface Config {
  apiKey: ApiKey;
  model: string;
  baseUrl: string;
  maxRetries: number;
  timeoutMs: number;
  debug: boolean;
}

export type ConfigResult = { ok: true; config: Config } | { ok: false; errors: string[] };

/** 解析环境变量。永远不抛出异常。 */
export function loadConfig(env: Env): ConfigResult {
  return todo("实现 loadConfig");
}

/** 遮住 API key：长度不超过 8 时是 "****"，否则是前 3 个字符 + "…" + 后 4 个字符。 */
export function maskKey(key: ApiKey): string {
  return todo("实现 maskKey");
}

/**
 * 给人看的配置摘要，用在启动日志里（API key 用 maskKey 遮住）：
 *
 *   模型：deepseek-chat
 *   地址：https://api.deepseek.com/v1
 *   API key：sk-…cdef
 *   重试：3 次，超时：60000ms
 *   调试：关
 */
export function describeConfig(config: Config): string {
  return todo("实现 describeConfig");
}
