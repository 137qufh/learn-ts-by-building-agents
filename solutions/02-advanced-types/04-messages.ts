/**
 * 练习 2-4 参考答案：按类型筛选
 */

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

// M 是裸露的类型参数，所以会对 Message 的每个成员分别判断（分配式条件类型）。
// 这里需要引入一个默认参数 M = Message：被检查的必须是类型参数才会分配，直接写 Message extends ... 不会分配。
export type MessageOfRole<R extends Role, M = Message> = M extends { role: R } ? M : never;

export type IsNever<T> = [T] extends [never] ? true : false;

// -? 很重要：可选属性在映射时会给值加上 undefined，最后 [keyof T] 取出的联合里就会多出 undefined。
export type KeysOfType<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T];

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export function ofRole<R extends Role>(messages: readonly Message[], role: R): MessageOfRole<R>[] {
  return messages.filter((m): m is MessageOfRole<R> => m.role === role);
}

export function lastOfRole<R extends Role>(
  messages: readonly Message[],
  role: R,
): MessageOfRole<R> | undefined {
  return messages.findLast((m): m is MessageOfRole<R> => m.role === role);
}

// 把约束反过来写：items 的元素在 K 这个键上的值是 number。
// 可选的数值字段（cachedTokens?: number）不满足 Record<K, number>，正好被拒绝。
export function sumField<K extends PropertyKey>(
  items: readonly Record<K, number>[],
  key: K,
): number {
  let total = 0;
  for (const item of items) {
    total += item[key];
  }
  return total;
}

export function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  // 函数（typeof 为 "function"）和基本类型直接走到这里，原样返回。
  // 断言是必要的：TS 无法在函数内部化简 DeepReadonly<T>（见 2.4 节）。
  return value as DeepReadonly<T>;
}
