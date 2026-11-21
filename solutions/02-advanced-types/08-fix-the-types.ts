/**
 * 练习 2-8 参考答案：修好这些类型
 */

// ── bug 1：Omit 压扁了联合 ────────────────────────────────────────
// 对联合取 keyof 只得到共有的键，model、toolCallId 就丢了。让 Omit 分配到每个成员上。
export type StoredMessage =
  | { id: string; createdAt: number; role: "user"; content: string }
  | { id: string; createdAt: number; role: "assistant"; content: string; model: string }
  | { id: string; createdAt: number; role: "tool"; toolCallId: string; content: string };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type NewMessage = DistributiveOmit<StoredMessage, "id" | "createdAt">;

// ── bug 2：keyof 联合只得到共有的键 ───────────────────────────────
// keyof (A | B) 是 A 和 B 都有的键；想要"任何一个成员有的键"，要先分配再取 keyof。
export type AgentEvent =
  | { type: "model_start"; model: string }
  | { type: "tool_start"; name: string; args: unknown }
  | { type: "tool_end"; name: string; durationMs: number };

type KeysOfUnion<T> = T extends unknown ? keyof T : never;

export type EventField = KeysOfUnion<AgentEvent>;

// ── bug 3：分配式条件类型逐个判断了成员 ───────────────────────────
// AllStrings<"a" | 1> 被分配成 true | false，也就是 boolean。包进元组阻止分配。
export type AllStrings<T> = [T] extends [string] ? true : false;

// ── bug 4：函数被映射成了空对象 ───────────────────────────────────
// 函数也是 object，对它做映射类型得到 {}。先把函数排除掉（同 2.4 节的 DeepReadonly）。
// 基本类型不需要特别处理：同态映射类型作用在 string、number 等基本类型上时，结果就是它本身。
export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : { [K in keyof T]?: DeepPartial<T[K]> };

// ── bug 5：key 没有被推断成字面量 ─────────────────────────────────
// key 的类型是 keyof T（整个联合），返回值也只能是所有属性类型的联合。
// 需要一个类型参数 K 来"记住"传进来的具体是哪个键。
export function getField<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// ── bug 6：推断时字面量被拓宽了 ───────────────────────────────────
// 没有 const 修饰时，{ name: "search" } 里的 name 被推断为 string。
export interface ToolDef {
  name: string;
  description: string;
}

export function defineTools<const T extends readonly ToolDef[]>(tools: T): T {
  return tools;
}

export type ToolNameOf<T extends readonly ToolDef[]> = T[number]["name"];
