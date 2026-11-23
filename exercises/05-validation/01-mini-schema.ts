/**
 * 练习 5-1：自己写一个迷你 schema 库
 *
 * 课程：chapters/05-validation/01-trust-boundaries.md
 * 运行：pnpm ex 01-mini-schema
 *
 * 一个 schema 是一个 **值**：运行时用它校验数据，编译期从它的 **类型** 推导出数据的类型。
 * 写完这道题，你就知道 Zod 的核心是怎么工作的了：
 *
 *   const Usage = object({ inputTokens: number(), cachedInputTokens: optional(number()) });
 *   type Usage = Infer<typeof Usage>;  // { inputTokens: number; cachedInputTokens?: number }
 *   Usage.parse(JSON.parse(text));     // { ok: true, value } 或者 { ok: false, issues }
 *
 * 规则：
 * - parse 永远不抛出异常，问题放进 issues 里返回
 * - 每个 issue 带上 path：从根到出问题的位置经过的键和下标，例如 ["messages", 2, "role"]
 * - object 和 array 不在第一个问题处停下，一次把所有问题都报告出来
 * - 错误信息的格式：`期望 ${期望的类型}，收到 ${typeName(实际的值)}`（literal 的期望类型是 JSON.stringify(值)）
 *
 * 两份测试：01-mini-schema.test.ts 检查运行时行为，01-mini-schema.test-d.ts 检查 Infer 推导出的类型。
 */
import { todo, type Todo } from "../todo.ts";

// ── 已给出的类型 ───────────────────────────────────────────────────

export type Path = (string | number)[];

export interface Issue {
  path: Path;
  message: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

export interface Schema<T> {
  /** 是不是 optional() 包出来的。object 靠它决定一个键是不是可选的。 */
  readonly optional: boolean;
  /** path 是这个值在整个输入里的位置，默认是 []（根）。 */
  parse(input: unknown, path?: Path): ParseResult<T>;
}

export interface OptionalSchema<T> extends Schema<T | undefined> {
  readonly optional: true;
}

/** 描述一个值的类型，用在错误信息里：null、array、NaN 单独区分出来，其余用 typeof。 */
export function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  return typeof value;
}

// ── 第一部分：类型 ─────────────────────────────────────────────────

/** 从一个 schema 的类型里取出它校验的数据的类型。Infer<Schema<string>> 是 string。（提示：infer，2.5 节） */
export type Infer<S> = Todo;

export type Shape = Record<string, Schema<unknown>>;

/**
 * object(shape) 校验出的类型：
 * - 值是 OptionalSchema 的键变成可选属性，类型里 **不带** undefined（exactOptionalPropertyTypes）
 * - 其他键是必选属性
 * - 结果展开成一个对象类型（不是交叉类型），鼠标悬停时好读
 *
 *   InferShape<{ a: Schema<string>; b: OptionalSchema<number> }>  →  { a: string; b?: number }
 *
 * 提示：2.3 节的键重映射（as），2.9 节项目里的 Prettify
 */
export type InferShape<S extends Shape> = Todo;

// ── 第二部分：基本类型 ─────────────────────────────────────────────

/** typeof 是 "string" 的值。 */
export function string(): Schema<string> {
  return todo("实现 string");
}

/** 有限的数字：NaN 和 ±Infinity 不算（它们不会出现在 JSON 里，出现了几乎总是 bug）。 */
export function number(): Schema<number> {
  return todo("实现 number");
}

export function boolean(): Schema<boolean> {
  return todo("实现 boolean");
}

/** 只接受和 expected 完全相等（===）的值。literal("user") 的类型是 Schema<"user">。 */
export function literal<const V extends string | number | boolean>(expected: V): Schema<V> {
  return todo("实现 literal");
}

/** undefined 直接通过，其他值交给 schema。 */
export function optional<T>(schema: Schema<T>): OptionalSchema<T> {
  return todo("实现 optional");
}

// ── 第三部分：组合 ─────────────────────────────────────────────────

/** 数组：每个元素都用 item 校验，元素的 path 是 [...path, 下标]。 */
export function array<T>(item: Schema<T>): Schema<T[]> {
  return todo("实现 array");
}

/**
 * 对象（不接受 null 和数组）：shape 里的每个键都用对应的 schema 校验，path 是 [...path, 键]。
 * - 缺少的键相当于值是 undefined：必选的键会报错，可选的键通过
 * - 可选的键没有值时，结果里 **不要** 出现这个键
 * - shape 里没有列出的键 **丢掉**，不出现在结果里
 */
export function object<S extends Shape>(shape: S): Schema<InferShape<S>> {
  return todo("实现 object");
}

/** 依次尝试每个 schema，返回第一个成功的结果；都失败时，在当前 path 报一个 "不符合任何一种情况"。 */
export function union<const S extends readonly Schema<unknown>[]>(
  ...options: S
): Schema<Infer<S[number]>> {
  return todo("实现 union");
}

/**
 * 把 issues 格式化成多行文本，每行 `${path 用 "." 连接}: ${message}`，path 为空时写 "(根)"：
 *
 *   messages.2.role: 期望 "user"，收到 string
 *   (根): 期望 object，收到 null
 */
export function formatIssues(issues: readonly Issue[]): string {
  return todo("实现 formatIssues");
}
