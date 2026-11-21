/**
 * 练习 2-2 参考答案：模型配置
 */

export interface ModelSettings {
  model: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
  stop: readonly string[];
}

export const DEFAULT_SETTINGS: ModelSettings = {
  model: "gpt-5",
  temperature: 0.7,
  maxTokens: 1024,
  stream: true,
  stop: [],
};

export const PROVIDERS = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-5",
    apiKeyEnv: "ANTHROPIC_API_KEY",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
    apiKeyEnv: "DEEPSEEK_API_KEY",
  },
} as const;

export type ProviderName = keyof typeof PROVIDERS;

// 索引访问类型的"键"可以是联合，所以 P 是联合时结果自然也是联合。
export type DefaultModel<P extends ProviderName> = (typeof PROVIDERS)[P]["defaultModel"];

export type ValueOf<T> = T[keyof T];

export function getSetting<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

export function withSetting<T, K extends keyof T>(obj: T, key: K, value: T[K]): T {
  return { ...obj, [key]: value };
}

export function pluck<T, K extends keyof T>(items: readonly T[], key: K): T[K][] {
  return items.map((item) => item[key]);
}

export function defaultModelOf<P extends ProviderName>(provider: P): DefaultModel<P> {
  return PROVIDERS[provider].defaultModel;
}

// 自己列出要比较的键，而不是用 Object.keys：这样既有准确的类型，又能保证顺序，
// 还自然忽略了运行时多出来的属性。satisfies 保证列表里没有拼错的键。
// 缺点是以后给 ModelSettings 加了新字段，编译器不会提醒你把它加到这里。下一节的映射类型能解决这个问题。
const SETTING_KEYS = [
  "model",
  "temperature",
  "maxTokens",
  "stream",
  "stop",
] as const satisfies readonly (keyof ModelSettings)[];

export function changedSettings(
  before: ModelSettings,
  after: ModelSettings,
): (keyof ModelSettings)[] {
  return SETTING_KEYS.filter((key) =>
    key === "stop" ? !sameStrings(before.stop, after.stop) : before[key] !== after[key],
  );
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}
