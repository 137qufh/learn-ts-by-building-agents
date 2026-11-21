/**
 * 第 2 章项目：类型安全的工具注册表
 *
 * 课程：chapters/02-advanced-types/09-project-tool-registry.md
 * 运行：pnpm ex tool-registry
 *
 * 模型调用工具时，我们要给它两样东西：一份"有哪些工具、每个工具要什么参数"的说明（JSON Schema），
 * 以及真正执行工具的代码。这个项目做一个注册表，把两者统一起来：
 *
 *   const weather = defineTool({
 *     name: "get_weather",
 *     description: "查询城市天气",
 *     parameters: {
 *       city: { type: "string", description: "城市名" },
 *       unit: { type: "enum", values: ["c", "f"], optional: true },
 *     },
 *     execute: (args) => ...,   // args 自动推断为 { city: string; unit?: "c" | "f" }
 *   });
 *
 *   const tools = createRegistry().register(weather).register(search);
 *   tools.schemas();                                // 交给模型的 JSON Schema
 *   tools.call("get_weather", { city: "北京" });     // 在代码里调用：名字、参数、返回值都有类型
 *   tools.dispatch({ id, name, arguments });         // 执行模型发来的调用：运行时校验，永不抛错
 *
 * 参数描述只写一次，类型（编译期）和 JSON Schema、校验（运行时）都从它推导出来。
 * 第 5 章会把这里手写的迷你 schema 换成 Zod，思路完全相同。
 *
 * 按顺序完成五个部分，每部分都有对应的测试。需要你写签名的函数先用 any 占位。
 * 不允许在你的答案里使用 any。
 */
import { todo, type Todo } from "../../todo.ts";

// ── 参数描述（已给出） ────────────────────────────────────────────

export type ParamSpec =
  | { type: "string"; description?: string; optional?: boolean }
  | { type: "number"; description?: string; optional?: boolean }
  | { type: "boolean"; description?: string; optional?: boolean }
  | { type: "enum"; values: readonly string[]; description?: string; optional?: boolean };

export type ParamsSpec = Record<string, ParamSpec>;

/** 把交叉类型展开成一个对象类型（2.8 节）。 */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};

// ── 第一部分：从参数描述推导参数类型 ──────────────────────────────

/**
 * 一个参数描述对应的值类型：
 * string → string，number → number，boolean → boolean，
 * enum → values 里的字面量的联合（`{ type: "enum"; values: readonly ["c", "f"] }` → `"c" | "f"`）
 */
export type ParamValue<P extends ParamSpec> = Todo;

/** 必需参数的键：optional 不是 true 的那些。 */
export type RequiredKeys<S extends ParamsSpec> = Todo;

/** 可选参数的键：optional 是 true 的那些。 */
export type OptionalKeys<S extends ParamsSpec> = Todo;

/**
 * 整个参数对象的类型：必需参数是必需属性，可选参数是可选属性，并且展开成一个对象类型。
 * 属性不能是 readonly（defineTool 用 const 推断，参数描述的属性会带上 readonly）。
 */
export type InferArgs<S extends ParamsSpec> = Todo;

// ── 第二部分：定义工具 ───────────────────────────────────────────

export interface Tool<N extends string, S extends ParamsSpec, R> {
  name: N;
  description: string;
  parameters: S;
  execute: (args: InferArgs<S>) => R;
}

/**
 * "任何工具"。execute 的参数是 never：参数位置的兼容方向是反过来的（2.4 节），
 * 所以任何 execute 函数都能赋值给 (args: never) => unknown。
 */
export interface AnyTool {
  name: string;
  description: string;
  parameters: ParamsSpec;
  execute: (args: never) => unknown;
}

/**
 * 原样返回工具定义，它的意义全在类型上：
 * - 工具名保持字面量类型（"get_weather" 而不是 string）
 * - enum 的 values 保持字面量类型，optional: true 保持字面量 true
 * - execute 的参数 args 自动推断为 InferArgs<parameters>，不需要手写
 * 调用方不需要写 as const。
 */
export function defineTool(tool: {
  name: string;
  description: string;
  parameters: ParamsSpec;
  // 占位用的 any：让 execute 的参数在你实现之前也能通过编译（project/demo.ts 和测试都依赖这一点）
  execute: (args: any) => unknown;
}): any {
  return todo("实现 defineTool");
}

// ── 第三部分：运行时校验 ─────────────────────────────────────────

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/**
 * 检查来自模型的参数 input 是否符合 spec。通过时返回 { ok: true, value }（value 就是 input 本身），
 * 否则返回所有错误。错误信息的格式（测试会逐字比较）：
 *
 * - input 不是普通对象（null、数组、字符串……）：只返回 ["参数必须是一个对象"]
 * - 按 spec 中参数的顺序检查每个参数：
 *   - 缺少必需参数（不存在或值为 undefined）：`缺少参数 "city"`
 *   - string / boolean 类型不对：`参数 "city" 应该是 string`、`参数 "verbose" 应该是 boolean`
 *   - number 类型不对，或者是 NaN / Infinity：`参数 "days" 应该是 number`
 *   - enum 的值不在 values 里（包括不是字符串）：`参数 "unit" 应该是 "c" | "f" 之一`
 *   - 可选参数不存在：没问题
 * - 然后按 input 中键的顺序，报告 spec 里没有的参数：`未知参数 "town"`
 *
 * 返回类型是 Validation<InferArgs<S>>。
 */
export function validateArgs(spec: any, input: unknown): any {
  return todo("实现 validateArgs");
}

// ── 第四部分：生成给模型看的 JSON Schema ──────────────────────────

export interface JsonSchemaProperty {
  type: "string" | "number" | "boolean";
  enum?: string[];
  description?: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, JsonSchemaProperty>;
    required: string[];
    additionalProperties: false;
  };
}

/**
 * 生成工具的 JSON Schema：
 * - 每个参数一个 property；enum 写成 { type: "string", enum: [...] }
 * - 有 description 时才写 description
 * - required 按 spec 的顺序列出所有必需参数
 */
export function toSchema(tool: AnyTool): ToolSchema {
  return todo("实现 toSchema");
}

// ── 第五部分：注册表 ─────────────────────────────────────────────

// 下面两个类型被 ToolRegistry 用在了有约束的位置（类型守卫、AnyTool 约束），不能用 Todo 占位，
// 所以先用"太宽泛"的类型占位：能通过编译，但类型测试会失败。

/** 注册表中所有工具名的联合。（占位：string） */
export type ToolName<T extends AnyTool> = string;

/** 工具联合 T 中名字为 N 的那个工具。（占位：AnyTool） */
export type ToolByName<T extends AnyTool, N extends ToolName<T>> = AnyTool;

/** 工具的参数类型。 */
export type ArgsOf<T extends AnyTool> = Todo;

/** 工具 execute 的返回类型。 */
export type ResultOf<T extends AnyTool> = Todo;

/** 重复注册时的错误信息：`DuplicateToolError<"search">` 是 `工具 "search" 已经注册过了`。 */
export type DuplicateToolError<N extends string> = Todo;

/** 模型发来的一次工具调用。arguments 是 JSON 字符串。 */
export interface RawToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type DispatchResult =
  { id: string; ok: true; value: unknown } | { id: string; ok: false; error: string };

export interface ToolRegistry<T extends AnyTool> {
  /**
   * 返回一个 **新的** 注册表，包含原有的工具和 tool；原注册表不变。
   * 工具名已经存在时抛出 Error，信息为 `工具 "search" 已经注册过了`。
   *
   * 挑战（最后再做）：让重复注册在编译期就报错，并且错误信息里出现 DuplicateToolError。
   * 提示：2.8 节"写类型时就让错误好懂"。
   */
  register<U extends AnyTool>(tool: U): ToolRegistry<T | U>;
  /** 所有工具名，按注册顺序。 */
  names(): ToolName<T>[];
  /** 类型守卫：name 是否是已注册的工具名。 */
  has(name: string): name is ToolName<T>;
  /** 在代码里直接调用工具。名字、参数、返回值都有类型。工具不存在时抛出 Error（类型上不会发生）。 */
  call<N extends ToolName<T>>(name: N, args: ArgsOf<ToolByName<T, N>>): ResultOf<ToolByName<T, N>>;
  /** 所有工具的 JSON Schema，按注册顺序。 */
  schemas(): ToolSchema[];
  /**
   * 执行一次来自模型的调用，**永远不抛出异常**，返回值里带上 call.id：
   * - 工具不存在：error 为 `未知工具 "xxx"`
   * - arguments 不是合法 JSON：error 为 `参数不是合法的 JSON`
   * - 参数校验失败：error 为所有错误信息用 "；" 连接
   * - execute 抛出异常：error 为 `工具执行失败：<异常的 message>`（不是 Error 时用 String(异常)）
   * - 成功：value 为 execute 的返回值
   */
  dispatch(call: RawToolCall): DispatchResult;
}

/** 创建一个空的注册表，返回类型是 ToolRegistry<never>。 */
export function createRegistry(): any {
  return todo("实现 createRegistry");
}
