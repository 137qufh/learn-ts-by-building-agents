/**
 * 练习 2-6 参考答案：命名
 */

export type Namespaced<S extends string, T extends string> = `${S}__${T}`;

// 三种情况分开处理：
// 1. string extends N 只有在 N 就是宽泛的 string 时才成立（任何字面量都比 string 窄）
// 2. 否则 N 是字面量（或字面量的联合），用模板 + infer 拆开
// 注意第 1 步要放在前面：string 不能匹配 `${infer S}__${infer T}`，会直接落到 undefined 分支。
export type ParsedToolName<N extends string> = string extends N
  ? { server: string; tool: string } | undefined
  : N extends `${infer S}__${infer T}`
    ? { server: S; tool: T }
    : undefined;

export type CamelCase<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : S;

export type CamelizeKeys<T> = { [K in keyof T as K extends string ? CamelCase<K> : K]: T[K] };

export function namespaced<S extends string, T extends string>(
  server: S,
  tool: T,
): Namespaced<S, T> {
  // 没有 as const 时，模板字符串表达式的类型是 string
  return `${server}__${tool}` as const;
}

export function isNamespaced(name: string): name is `${string}__${string}` {
  return name.includes("__");
}

export function parseToolName<N extends string>(name: N): ParsedToolName<N> {
  const index = name.indexOf("__");
  const parsed =
    index === -1 ? undefined : { server: name.slice(0, index), tool: name.slice(index + 2) };
  return parsed as ParsedToolName<N>;
}

export function toCamelCase<S extends string>(text: S): CamelCase<S> {
  // 和类型的定义一一对应：按 "_" 切开，第一段原样保留，后面每一段首字母大写。
  // （用正则 /_(.)/g 替换看起来更短，但遇到 "a__b"、"a_" 这样的输入时会和类型的结果不一致。）
  const [head = "", ...rest] = text.split("_");
  const camel = head + rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  return camel as CamelCase<S>;
}

export function camelizeKeys<T extends object>(obj: T): CamelizeKeys<T> {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [toCamelCase(key), value]),
  ) as CamelizeKeys<T>;
}
