/**
 * 第 5 章项目：用 Zod 定义工具
 *
 * 课程：chapters/05-validation/07-project-zod-tools.md
 * 运行：pnpm ex toolbox
 *
 * 第 2 章的注册表用一个手写的迷你 schema（ParamSpec）描述参数。现在换成 Zod：
 *
 *   const readFile = defineTool({
 *     name: "read_file",
 *     description: "读取一个文本文件",
 *     parameters: z.object({ path: z.string().min(1), maxLines: z.number().int().min(1).default(200) }),
 *     execute: async ({ path, maxLines }, { signal }) => ...,   // 参数是 schema 的输出类型
 *   });
 *
 *   const tools = createToolbox([readFile, search]);
 *   tools.schemas();                               // 给模型的函数描述（5.4 节）
 *   await tools.call("read_file", { path: "a" });  // 在代码里调用：名字、参数（schema 的输入类型）、返回值都有类型
 *   await tools.dispatch({ id, name, arguments }); // 执行模型发来的调用（5.5 节），结果是给模型看的文本
 *
 * 这个项目会用到你在练习 5-4 和 5-5 里写的 defineFunction、strictFunction、parseToolArguments。
 *
 * 第一部分：defineTool
 *   原样返回工具定义，意义全在类型上：工具名保持字面量，execute 的 args 是 z.output<parameters>。
 *   把签名里的 any 换成泛型（参考 ZodTool）。
 *
 * 第二部分：类型工具 ArgsInput、ResultOf（见各自的注释）
 *
 * 第三部分：toContent(value)：工具的返回值转成给模型看的文本
 *   字符串原样返回；undefined 是 "（没有返回值）"；其他值用 JSON.stringify
 *
 * 第四部分：createToolbox(tools)
 *   - 工具名重复时抛出 Error(`工具 "${name}" 重复了`)
 *   - 创建时就生成所有工具的函数描述：strict: true 的工具用 strictFunction，其他用 defineFunction
 *     （这样 schema 的问题在启动时就暴露出来）
 *   - names()：按传入的顺序
 *   - schemas()：每次返回新的副本，调用方修改它不影响工具箱
 *   - call(name, args, options)：用工具的 schema 解析 args（失败时 Promise 拒绝，错误是 ZodError），
 *     再执行工具，Promise 的结果是工具的返回值（execute 返回 Promise 时是它的结果）。
 *     未知的名字（只可能来自绕过了类型检查的代码）：Promise 拒绝，Error(`未知工具 "${name}"`)
 *   - dispatch(call, options)：执行模型发来的调用，结果是 { id, ok, content }，按顺序：
 *       未知工具       → ok: false，content 是 `未知工具 "${name}"。可用的工具：${名字用 ", " 连接}`
 *       参数不合格     → ok: false，content 是 parseToolArguments 的 error
 *       已经取消       → 不执行工具，抛出 signal.reason（提示：signal.throwIfAborted()）
 *       工具抛出错误   → ok: false，content 是 `工具执行失败：${错误的 message}`（不是 Error 时用 String(错误)）
 *                        但如果这时 signal 已经取消，说明错误是取消造成的：把错误原样抛出去
 *       返回值转不成文本（比如 BigInt）→ ok: false，content 是 `工具的返回值无法转成文本：${message}`
 *       成功           → ok: true，content 是 toContent(返回值)
 *   - call 和 dispatch 都把 options.signal 作为 context.signal 传给 execute；没有 signal 时 context 是 {}
 *
 * 不允许在你的答案里使用 any。
 */
import type { z } from "zod";
import type { RawToolCall } from "../../02-advanced-types/project/tool-registry.ts";
import type { FunctionSchema } from "../04-tool-schema.ts";
import { todo, type Todo } from "../../todo.ts";

// ── 第一部分：定义工具 ───────────────────────────────────────────

export interface ToolContext {
  signal?: AbortSignal;
}

export interface ZodTool<N extends string, S extends z.ZodType, R> {
  name: N;
  description: string;
  parameters: S;
  strict?: boolean;
  execute: (args: z.output<S>, context: ToolContext) => R;
}

/** 任何工具都能赋值给它（execute 的参数写成 never 的原因见第 2 章项目）。 */
export interface AnyZodTool {
  name: string;
  description: string;
  parameters: z.ZodType;
  strict?: boolean;
  execute: (args: never, context: ToolContext) => unknown;
}

export function defineTool(tool: {
  name: string;
  description: string;
  parameters: z.ZodType;
  strict?: boolean;
  // 占位用的 any：让 execute 的参数在你实现之前也能通过编译
  execute: (args: any, context: ToolContext) => unknown;
}): any {
  return todo("实现 defineTool");
}

// ── 第二部分：类型工具 ───────────────────────────────────────────

// 已给出（和第 2 章一样）
export type ToolName<T extends AnyZodTool> = T["name"];
export type ToolByName<T extends AnyZodTool, N extends ToolName<T>> = Extract<T, { name: N }>;

/** 在代码里调用工具时传的参数：schema 的「输入」类型（有默认值的字段可以不传）。 */
export type ArgsInput<T extends AnyZodTool> = Todo;
/** 工具的返回值；execute 返回 Promise 时是 Promise 的结果。 */
export type ResultOf<T extends AnyZodTool> = Todo;

// ── 第三部分：工具箱 ─────────────────────────────────────────────

export type ToolResult = { id: string; ok: boolean; content: string };

export interface CallOptions {
  signal?: AbortSignal;
}

export interface Toolbox<T extends AnyZodTool> {
  names(): ToolName<T>[];
  schemas(): FunctionSchema[];
  call<N extends ToolName<T>>(
    name: N,
    args: ArgsInput<ToolByName<T, N>>,
    options?: CallOptions,
  ): Promise<ResultOf<ToolByName<T, N>>>;
  dispatch(call: RawToolCall, options?: CallOptions): Promise<ToolResult>;
}

export function toContent(value: unknown): string {
  return todo("实现 toContent");
}

export function createToolbox<const T extends readonly AnyZodTool[]>(tools: T): Toolbox<T[number]> {
  return todo("实现 createToolbox");
}
