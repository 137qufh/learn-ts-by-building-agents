/**
 * 练习 1-6：工具参数与错误信息
 *
 * 课程：chapters/01-basics/07-any-unknown-never.md
 * 运行：pnpm ex 06-tool-arguments
 *
 * 模型决定调用工具时，会以 JSON 字符串的形式给出参数，比如
 *   '{"query": "TypeScript 7", "limit": 5}'
 * 这个字符串来自模型，什么都可能发生：不是合法 JSON、是个数组、少了参数、参数类型不对……
 * 这道题练习用 unknown 和类型收窄，把"不可信的输入"安全地变成"可以使用的值"。
 *
 * 要求：整个实现中不要出现 any，也不要使用 as 类型断言。
 */
import { todo } from "../todo.ts";

/**
 * 类型守卫：value 是否是一个"普通对象"（不是 null，不是数组）。
 * 通过检查后，就可以把 value 当作 Record<string, unknown> 来读取属性。
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return todo("实现 isRecord");
}

/**
 * 把模型给出的参数字符串解析成对象。
 *
 * - 空字符串或只有空白：返回 {}（有些模型调用无参数的工具时会给出空字符串）
 * - 不是合法 JSON：抛出 Error，信息以 "工具参数不是合法的 JSON" 开头
 * - 是合法 JSON 但不是对象（例如数组、数字、null）：抛出 Error，信息为 "工具参数必须是 JSON 对象"
 *
 * 提示：JSON.parse 返回 any，先把结果存进一个 unknown 类型的变量。
 */
export function parseToolArguments(json: string): Record<string, unknown> {
  return todo("实现 parseToolArguments");
}

/** 读取一个字符串参数；参数不存在或不是字符串时返回 undefined。 */
export function getString(args: Record<string, unknown>, key: string): string | undefined {
  return todo("实现 getString");
}

/**
 * 读取一个必需的数字参数。
 * 参数不存在、不是 number 类型、或者是 NaN / Infinity 时，抛出 Error：
 *   `参数 <key> 必须是有限的数字`
 *
 * 提示：Number.isFinite 对 NaN 和 ±Infinity 都返回 false。
 */
export function requireNumber(args: Record<string, unknown>, key: string): number {
  return todo("实现 requireNumber");
}

/**
 * 从任意被 throw 出来的值中提取一条可读的错误信息：
 *
 * - Error 实例 → error.message；如果 message 为空字符串，返回 error.name（例如 "TypeError"）
 * - 字符串 → 字符串本身
 * - 带有字符串类型 message 属性的对象（例如 { message: "超时" }）→ 该 message
 * - 其他任何值 → "未知错误"
 */
export function getErrorMessage(error: unknown): string {
  return todo("实现 getErrorMessage");
}
