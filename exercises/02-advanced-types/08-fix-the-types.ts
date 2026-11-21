/**
 * 练习 2-8：修好这些类型
 *
 * 课程：chapters/02-advanced-types/08-debugging-type-errors.md
 * 运行：pnpm ex 08-fix-the-types
 *
 * 这道题和之前的不一样：下面的代码都已经写好了，也都能通过编译，但每一处都藏着一个类型上的 bug。
 * 有的是这一章讲过的陷阱，有的是一个小小的疏忽。类型测试（08-fix-the-types.test-d.ts）描述了
 * 正确的行为，现在它们是红的。
 *
 * 用 2.8 节的方法定位问题：读失败信息、悬停看实际类型、把复杂的类型拆开。
 * 每修好一处，就会有一组测试变绿。只修改类型和函数签名，不需要改函数体里的运行时逻辑
 * （除非为了让修改后的签名通过编译，需要做相应的小调整）。
 */

// ── bug 1 ────────────────────────────────────────────────────────
export type StoredMessage =
  | { id: string; createdAt: number; role: "user"; content: string }
  | { id: string; createdAt: number; role: "assistant"; content: string; model: string }
  | { id: string; createdAt: number; role: "tool"; toolCallId: string; content: string };

/** 新消息还没有 id 和 createdAt，其余字段和存储的消息一样。 */
export type NewMessage = Omit<StoredMessage, "id" | "createdAt">;

// ── bug 2 ────────────────────────────────────────────────────────
export type AgentEvent =
  | { type: "model_start"; model: string }
  | { type: "tool_start"; name: string; args: unknown }
  | { type: "tool_end"; name: string; durationMs: number };

/** 所有事件中出现过的字段名（任何一种事件有的都算）。 */
export type EventField = keyof AgentEvent;

// ── bug 3 ────────────────────────────────────────────────────────
/** 联合的 **每一个** 成员都是字符串时为 true，否则为 false。 */
export type AllStrings<T> = T extends string ? true : false;

// ── bug 4 ────────────────────────────────────────────────────────
/** 把对象的每一层都变成可选。函数保持原样（不要把函数变成对象）。 */
export type DeepPartial<T> = { [K in keyof T]?: DeepPartial<T[K]> };

// ── bug 5 ────────────────────────────────────────────────────────
/** 读取一个属性，返回值的类型就是那个属性的类型。 */
export function getField<T>(obj: T, key: keyof T): T[keyof T] {
  return obj[key];
}

// ── bug 6 ────────────────────────────────────────────────────────
export interface ToolDef {
  name: string;
  description: string;
}

/** 定义一组工具，原样返回。要求调用方不写 as const，也能拿到每个工具名的字面量类型。 */
export function defineTools<T extends readonly ToolDef[]>(tools: T): T {
  return tools;
}

/** 一组工具的名字的联合。 */
export type ToolNameOf<T extends readonly ToolDef[]> = T[number]["name"];
