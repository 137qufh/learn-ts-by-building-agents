/**
 * 练习 2-6：命名
 *
 * 课程：chapters/02-advanced-types/06-template-literal-types.md
 * 运行：pnpm ex 06-naming
 *
 * agent 同时连接好几个 MCP 服务器时，不同服务器可能都有一个叫 "search" 的工具。
 * 常见的做法是给工具名加上服务器前缀："github__search"、"docs__search"。
 * 另一方面，模型 API 返回的字段是 snake_case（finish_reason），而我们的代码用 camelCase。
 * 这道题用模板字面量类型描述这两种命名规则，并实现对应的运行时函数。
 *
 * 需要你写签名的函数先用 any 占位；类型测试在 06-naming.test-d.ts。
 * 不允许在你的答案里使用 any。
 */
import { todo, type Todo } from "../todo.ts";

/** 服务器 S 上的工具 T 的完整名字：`Namespaced<"github", "search">` 是 `"github__search"`。 */
export type Namespaced<S extends string, T extends string> = Todo;

/**
 * 解析工具名，在 **第一个** "__" 处拆开：
 * - 能拆开的字面量：`{ server: "github"; tool: "search" }`
 * - 没有 "__" 的字面量：`undefined`
 * - 只知道是 string（比如来自模型的输出）：`{ server: string; tool: string } | undefined`
 *
 * 提示：怎么判断 N 是不是"宽泛的 string"？想一想 `string extends N` 什么时候成立。
 */
export type ParsedToolName<N extends string> = Todo;

/**
 * snake_case 转 camelCase：`CamelCase<"prompt_tokens">` 是 `"promptTokens"`。
 * 没有下划线时原样返回。
 */
export type CamelCase<S extends string> = Todo;

/** 把对象（只处理第一层）的字符串键都转成 camelCase，值的类型不变。 */
export type CamelizeKeys<T> = Todo;

/** 拼出完整的工具名，返回类型是精确的模板字面量类型。 */
export function namespaced(server: any, tool: any): any {
  return todo("实现 namespaced");
}

/** 是否是带服务器前缀的工具名（包含 "__"）。是类型守卫。 */
export function isNamespaced(name: string): any {
  return todo("实现 isNamespaced");
}

/**
 * 运行时解析工具名，规则和 ParsedToolName 一致（在第一个 "__" 处拆开）。返回类型是 ParsedToolName<N>。
 *
 * 提示：返回类型依赖类型参数，实现里需要一次断言（2.4 节）。
 */
export function parseToolName(name: any): any {
  return todo("实现 parseToolName");
}

/**
 * 运行时的 snake_case 转 camelCase，返回类型是 CamelCase<S>。
 * 运行时的结果必须和 CamelCase 类型完全一致，包括 "a__b"、"trailing_" 这样的边界情况：
 * 先想清楚你的 CamelCase 类型会把它们变成什么。
 */
export function toCamelCase(text: any): any {
  return todo("实现 toCamelCase");
}

/**
 * 返回一个新对象，第一层的键都转成 camelCase，值原样保留（不递归）。
 * 例如 `{ finish_reason: "stop", usage: { prompt_tokens: 1 } }`
 * → `{ finishReason: "stop", usage: { prompt_tokens: 1 } }`
 */
export function camelizeKeys(obj: any): any {
  return todo("实现 camelizeKeys");
}
