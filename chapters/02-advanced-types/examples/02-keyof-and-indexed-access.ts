// 运行：pnpm tsx chapters/02-advanced-types/examples/02-keyof-and-indexed-access.ts
// 配套课程：2.2 keyof、typeof 与索引访问类型

// ── 类型位置的 typeof：从值得到类型 ───────────────────────────────
const DEFAULT_SETTINGS = {
  model: "gpt-5",
  temperature: 0.7,
  maxTokens: 1024,
  stream: true,
};
type Settings = typeof DEFAULT_SETTINGS;
// { model: string; temperature: number; maxTokens: number; stream: boolean; }

console.log(typeof DEFAULT_SETTINGS); // object —— 值位置的 typeof 是 JavaScript 的运算符，返回字符串

// ── keyof：对象类型的所有键组成的联合 ─────────────────────────────
type SettingKey = keyof Settings; // "model" | "temperature" | "maxTokens" | "stream"

const key: SettingKey = "maxTokens";
// @ts-expect-error -- Type '"max_tokens"' is not assignable to type '"maxTokens" | "model" | "stream" | "temperature"'. Did you mean '"maxTokens"'?
const wrongKey: SettingKey = "max_tokens";
console.log(key, wrongKey);

// ── 索引访问类型：T["键"] 取出属性的类型 ───────────────────────────
type Temperature = Settings["temperature"]; // number
type ModelOrStream = Settings["model" | "stream"]; // string | boolean
type SettingValue = Settings[keyof Settings]; // string | number | boolean
const t: Temperature = 0.2;
const ms: ModelOrStream = false;
const sv: SettingValue = "gpt-5";
console.log(t, ms, sv);

// 嵌套类型也能一层层取出来，不必为每一层单独起名
interface ChatResponse {
  choices: { message: { role: "assistant"; content: string }; finishReason: string }[];
  usage: { inputTokens: number; outputTokens: number };
}
type Choice = ChatResponse["choices"][number]; // 数组元素的类型
type Usage = ChatResponse["usage"];
const usage: Usage = { inputTokens: 10, outputTokens: 20 };
const choice: Choice = { message: { role: "assistant", content: "你好" }, finishReason: "stop" };
console.log(usage.inputTokens + usage.outputTokens, choice.message.content); // 30 你好

// ── 泛型 + keyof：类型安全的取值函数 ──────────────────────────────
function getSetting<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
const maxTokens = getSetting(DEFAULT_SETTINGS, "maxTokens"); // number
const stream = getSetting(DEFAULT_SETTINGS, "stream"); // boolean
console.log(maxTokens, stream); // 1024 true
// @ts-expect-error -- Argument of type '"maxToken"' is not assignable to parameter of type '"maxTokens" | "model" | "stream" | "temperature"'.
getSetting(DEFAULT_SETTINGS, "maxToken");

// 如果 key 只是 string，就不能拿来索引
function getLoose(obj: Settings, key: string): unknown {
  // @ts-expect-error -- Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ model: string; temperature: number; maxTokens: number; stream: boolean; }'.
  return obj[key];
}
console.log(getLoose(DEFAULT_SETTINGS, "model")); // gpt-5

// 值的类型跟着键走
function withSetting<T, K extends keyof T>(obj: T, key: K, value: T[K]): T {
  return { ...obj, [key]: value };
}
console.log(withSetting(DEFAULT_SETTINGS, "temperature", 0).temperature); // 0
// @ts-expect-error -- Argument of type 'string' is not assignable to parameter of type 'number'.
withSetting(DEFAULT_SETTINGS, "temperature", "low");

// ── keyof typeof：从一张常量表得到键的联合 ────────────────────────
const PROVIDERS = {
  openai: { baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-5" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", defaultModel: "claude-sonnet-4-5" },
} as const;
type ProviderName = keyof typeof PROVIDERS; // "openai" | "anthropic"
type AnthropicDefault = (typeof PROVIDERS)["anthropic"]["defaultModel"]; // "claude-sonnet-4-5"

function baseUrlOf(provider: ProviderName): string {
  return PROVIDERS[provider].baseUrl; // provider 是表里的键，所以一定能取到
}
const m: AnthropicDefault = "claude-sonnet-4-5";
console.log(baseUrlOf("anthropic"), m); // https://api.anthropic.com/v1 claude-sonnet-4-5

// ── Object.keys 返回 string[]，而不是 (keyof T)[] ──────────────────
interface Point {
  x: number;
  y: number;
}
const point3d = { x: 1, y: 2, z: 3 };
const p: Point = point3d; // ✅ 结构类型：多出来的 z 不影响赋值
console.log(Object.keys(p)); // [ 'x', 'y', 'z' ] —— 运行时的键比类型里写的多

function sumCoordinates(point: Point): number {
  let sum = 0;
  for (const k of Object.keys(point)) {
    // @ts-expect-error -- Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'Point'.
    sum += point[k];
  }
  return sum;
}
console.log(sumCoordinates(p)); // 6 —— 把 z 也加进去了！这正是 TS 不让你这样写的原因

// 正确做法：遍历你自己列出的键
const POINT_KEYS = ["x", "y"] as const satisfies readonly (keyof Point)[];
function sumKnown(point: Point): number {
  let sum = 0;
  for (const k of POINT_KEYS) {
    sum += point[k];
  }
  return sum;
}
console.log(sumKnown(p)); // 3

// ── 索引签名的 keyof ─────────────────────────────────────────────
type Prices = Record<string, number>;
type PriceKey = keyof Prices; // string
type Dict = { [key: string]: number };
type DictKey = keyof Dict; // string | number —— 因为 JavaScript 里 obj[1] 和 obj["1"] 是同一个属性
const pk: PriceKey = "gpt-5";
const dk: DictKey = 1;
console.log(pk, dk);
