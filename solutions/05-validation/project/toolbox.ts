/**
 * 第 5 章项目参考答案：用 Zod 定义工具
 */
import type { z } from "zod";
import type { RawToolCall } from "../../02-advanced-types/project/tool-registry.ts";
import { defineFunction, strictFunction, type FunctionSchema } from "../04-tool-schema.ts";
import { parseToolArguments } from "../05-repair-loop.ts";

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

// S 不需要 const：Zod schema 本身就保留了所有字面量信息
export function defineTool<const N extends string, S extends z.ZodType, R>(
  tool: ZodTool<N, S, R>,
): ZodTool<N, S, R> {
  return tool;
}

// ── 第二部分：类型工具 ───────────────────────────────────────────

export type ToolName<T extends AnyZodTool> = T["name"];
export type ToolByName<T extends AnyZodTool, N extends ToolName<T>> = Extract<T, { name: N }>;
export type ArgsInput<T extends AnyZodTool> = z.input<T["parameters"]>;
export type ResultOf<T extends AnyZodTool> = Awaited<ReturnType<T["execute"]>>;

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
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined) {
    return "（没有返回值）";
  }
  return JSON.stringify(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function contextOf(options: CallOptions): ToolContext {
  return options.signal === undefined ? {} : { signal: options.signal };
}

export function createToolbox<const T extends readonly AnyZodTool[]>(tools: T): Toolbox<T[number]> {
  type Tools = T[number];
  const byName = new Map<string, AnyZodTool>();
  for (const tool of tools) {
    if (byName.has(tool.name)) {
      throw new Error(`工具 "${tool.name}" 重复了`);
    }
    byName.set(tool.name, tool);
  }
  // 启动时就生成：strict 工具的 schema 有问题时，在这里就抛出，而不是等到第一次请求
  const schemas = tools.map((tool) =>
    tool.strict === true
      ? strictFunction(tool.name, tool.description, tool.parameters)
      : defineFunction(tool.name, tool.description, tool.parameters),
  );

  // AnyZodTool 的 execute 只接受 never：调用方保证 args 已经通过了这个工具的 schema
  const run = (tool: AnyZodTool, args: unknown, options: CallOptions): unknown =>
    tool.execute(args as never, contextOf(options));

  return {
    names() {
      return tools.map((tool) => tool.name);
    },

    schemas() {
      return schemas.map((schema) => structuredClone(schema));
    },

    call(name, args, options = {}) {
      const result = (async () => {
        const tool = byName.get(name);
        if (tool === undefined) {
          throw new Error(`未知工具 "${name}"`);
        }
        return run(tool, tool.parameters.parse(args), options);
      })();
      // byName 丢掉了名字和工具的对应关系，这里用断言接回来：结果就是这个工具的返回值
      return result as Promise<ResultOf<ToolByName<Tools, typeof name>>>;
    },

    async dispatch(call, options = {}) {
      const tool = byName.get(call.name);
      if (tool === undefined) {
        const available = tools.map((t) => t.name).join(", ");
        return {
          id: call.id,
          ok: false,
          content: `未知工具 "${call.name}"。可用的工具：${available}`,
        };
      }
      const args = parseToolArguments(call.arguments, tool.parameters);
      if (!args.ok) {
        return { id: call.id, ok: false, content: args.error };
      }
      options.signal?.throwIfAborted();

      let value: unknown;
      try {
        value = await run(tool, args.value, options);
      } catch (error) {
        // 被取消不是工具的错，也不该告诉模型：直接传出去，由调用方处理（3.6 节）
        if (options.signal?.aborted === true) {
          throw error;
        }
        return { id: call.id, ok: false, content: `工具执行失败：${messageOf(error)}` };
      }
      try {
        return { id: call.id, ok: true, content: toContent(value) };
      } catch (error) {
        return { id: call.id, ok: false, content: `工具的返回值无法转成文本：${messageOf(error)}` };
      }
    },
  };
}
