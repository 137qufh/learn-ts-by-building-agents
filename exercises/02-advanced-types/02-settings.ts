/**
 * 练习 2-2：模型配置
 *
 * 课程：chapters/02-advanced-types/02-keyof-and-indexed-access.md
 * 运行：pnpm ex 02-settings
 *
 * agent 启动时要决定连哪家供应商、用哪个模型、温度多少……这些配置散落在默认值、
 * 配置文件和命令行参数里。这道题为它们写几个类型安全的小工具：键写错、值的类型不对，
 * 都要在编译期报错。
 *
 * 和上一题一样，需要你写签名的函数先用 any 占位；类型测试在 02-settings.test-d.ts。
 * 不允许在你的答案里使用 any。
 */
import { todo, type Todo } from "../todo.ts";

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

/** 所有供应商的名字："openai" | "anthropic" | "deepseek"。要求从 PROVIDERS 推导，不要手写。 */
export type ProviderName = Todo;

/**
 * 某个供应商的默认模型的字面量类型，例如 `DefaultModel<"deepseek">` 是 `"deepseek-chat"`。
 * 传入联合时得到对应的联合。
 */
export type DefaultModel<P extends ProviderName> = Todo;

/** 对象所有属性值的类型组成的联合。`ValueOf<{ a: 1; b: "x" }>` 是 `1 | "x"`。 */
export type ValueOf<T> = Todo;

/**
 * 读取对象的一个属性。key 只能是 obj 的键，返回值的类型就是那个属性的类型。
 * 不要只针对 ModelSettings 写：任何对象都应该能用。
 */
export function getSetting(obj: any, key: any): any {
  return todo("实现 getSetting");
}

/**
 * 返回一个修改了某个属性的 **新对象**，不修改原对象。
 * value 的类型必须和 key 对应的属性类型一致。
 */
export function withSetting(obj: any, key: any, value: any): any {
  return todo("实现 withSetting");
}

/**
 * 从对象数组里取出每个元素的同一个属性。
 * `pluck([{ id: "a", n: 1 }], "n")` 返回 `[1]`，类型是 `number[]`。
 */
export function pluck(items: readonly any[], key: any): any {
  return todo("实现 pluck");
}

/**
 * 返回供应商的默认模型。返回类型是字面量：`defaultModelOf("openai")` 的类型是 `"gpt-5"`。
 */
export function defaultModelOf(provider: any): any {
  return todo("实现 defaultModelOf");
}

/**
 * 比较两份配置，按 ModelSettings 中声明的顺序（model、temperature、maxTokens、stream、stop）
 * 返回值不同的键。
 *
 * - 基本类型用 === 比较
 * - stop 是数组：长度相同且每个元素都 === 时才算相同（两个不同的数组对象，内容一样就算相同）
 * - 只比较 ModelSettings 声明的五个键：即使传入的对象在运行时带了别的属性，也要忽略它们
 *
 * 提示：2.2 节"为什么 Object.keys 返回 string[]"讲了这里该怎么遍历键。
 */
export function changedSettings(
  before: ModelSettings,
  after: ModelSettings,
): (keyof ModelSettings)[] {
  return todo("实现 changedSettings");
}
