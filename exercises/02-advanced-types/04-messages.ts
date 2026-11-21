/**
 * 练习 2-4：按类型筛选
 *
 * 课程：chapters/02-advanced-types/04-conditional-types.md
 * 运行：pnpm ex 04-messages
 *
 * agent 的聊天记录里混着四种消息。渲染界面时要挑出某一种；统计用量时要把某个数值字段加起来；
 * 把配置交给插件之前，要保证插件无论如何都改不了它。这道题用条件类型完成这三件事。
 *
 * 需要你写签名的函数先用 any 占位；类型测试在 04-messages.test-d.ts。
 * 不允许在你的答案里使用 any。
 */
import { todo, type Todo } from "../todo.ts";

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string; isError?: boolean };

export type Role = Message["role"];

/**
 * 消息联合中 role 为 R 的成员。R 是联合时得到对应成员的联合。
 * 请用条件类型自己实现，不要直接用 Extract。
 *
 * 提示：只有当 extends 左边是一个"裸露的类型参数"时，条件类型才会分配。
 * 直接写 `Message extends ...` 不会分配；可以给 MessageOfRole 加第二个带默认值的类型参数。
 */
export type MessageOfRole<R extends Role> = Todo;

/** T 是 never 时为 true，否则为 false。注意 2.4 节讲的陷阱。 */
export type IsNever<T> = Todo;

/** T 中值能赋值给 V 的那些键的联合。没有这样的键时是 never。 */
export type KeysOfType<T, V> = Todo;

/**
 * 把对象的每一层都变成只读：
 * - 函数保持原样
 * - 数组变成只读数组，元素也递归处理
 * - 对象的每个属性都变成 readonly，属性值递归处理
 * - 其他类型（string、number……）保持原样
 */
export type DeepReadonly<T> = Todo;

/** 返回所有 role 为 role 的消息，保持原来的顺序。返回值的类型是精确的。 */
export function ofRole(messages: readonly any[], role: any): any {
  return todo("实现 ofRole");
}

/** 返回最后一条 role 为 role 的消息；没有时返回 undefined。 */
export function lastOfRole(messages: readonly any[], role: any): any {
  return todo("实现 lastOfRole");
}

/**
 * 把 items 中每个元素的 key 字段加起来。key 对应的值必须是 number，
 * 传入值不是 number 的键要报类型错误。空数组返回 0。
 *
 * 提示：直接用 KeysOfType 写签名，函数体里会遇到什么问题？2.4 节"同样的问题"一段讲了解决办法。
 */
export function sumField(items: readonly any[], key: any): any {
  return todo("实现 sumField");
}

/**
 * 递归地冻结一个值（Object.freeze），返回它本身，类型是 DeepReadonly<T>。
 * - 数组和普通对象：先冻结每个属性值，再冻结它自己
 * - 函数、基本类型：原样返回，不冻结
 *
 * 提示：2.4 节讲过，返回类型是依赖类型参数的条件类型时，实现里需要一次断言。
 * 这里断言是合理的：测试会检查运行时行为确实和类型一致。
 */
export function deepFreeze(value: any): any {
  return todo("实现 deepFreeze");
}
