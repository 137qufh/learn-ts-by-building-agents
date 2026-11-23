/**
 * 把一个 MCP 客户端适配成 harness 的 ToolExecutor（第 7 章）。
 *
 * 这里故意不 import MCP SDK：适配器只需要 listTools / callTool 这两个方法。
 * 官方的 Client 结构上符合 McpToolSource，调用方自己安装 SDK、自己连接服务器。
 * 因此主入口仍然不依赖 @modelcontextprotocol/*，也不依赖 zod（4.7 节的拆包标准）。
 */
import type { FunctionDefinition } from "./client.ts";
import type { RawToolCall } from "./registry.ts";
import type { ToolExecutor } from "./agent/loop.ts";

export interface McpListedTool {
  name: string;
  // `| undefined` 是为了 exactOptionalPropertyTypes：官方 Client 的可选字段类型里写了 undefined。
  description?: string | undefined;
  inputSchema?: unknown;
}

export interface McpContentBlock {
  type: string;
  text?: string | undefined;
}

export interface McpToolResult {
  content: readonly McpContentBlock[];
  isError?: boolean | undefined;
  structuredContent?: unknown;
}

/** 官方 Client 能赋给它。方法比接口多、返回值字段比接口多，都没关系。 */
export interface McpToolSource {
  listTools(): Promise<{ tools: readonly McpListedTool[] }>;
  callTool(
    params: { name: string; arguments?: Record<string, unknown> },
    options?: { signal?: AbortSignal; timeout?: number },
  ): Promise<McpToolResult>;
}

export interface McpExecutorOptions {
  /**
   * 加在每个工具名前，避免两个服务器都有 search。
   * 用双下划线，和第 2 章的模板字面量类型同一条规则：第一次出现的 "__" 是分界。
   */
  prefix?: string;
  /** 传给 callTool 的超时（毫秒）。不传就用 SDK 自己的默认值（60 秒）。 */
  timeoutMs?: number;
}

interface ExposedTool {
  remoteName: string;
  schema: FunctionDefinition;
}

export async function createMcpExecutor(
  source: McpToolSource,
  options: McpExecutorOptions = {},
): Promise<ToolExecutor> {
  const prefix = options.prefix;
  if (prefix !== undefined && prefix.includes("__")) {
    throw new Error(`前缀不能包含 "__"，否则拆不开服务器和工具：${prefix}`);
  }
  const listed = await source.listTools();
  const tools = new Map<string, ExposedTool>();
  for (const tool of listed.tools) {
    const name = prefix === undefined || prefix === "" ? tool.name : `${prefix}__${tool.name}`;
    if (tools.has(name)) {
      throw new Error(`工具 "${name}" 重复了`);
    }
    tools.set(name, {
      remoteName: tool.name,
      schema: {
        name,
        description: tool.description ?? tool.name,
        parameters: parametersOf(tool.inputSchema),
      },
    });
  }

  function schemas(): FunctionDefinition[] {
    return [...tools.values()].map((tool) => structuredClone(tool.schema));
  }

  async function dispatch(
    call: RawToolCall,
    callOptions?: { signal?: AbortSignal },
  ): Promise<{ id: string; ok: boolean; content: string }> {
    const tool = tools.get(call.name);
    if (tool === undefined) {
      const available = [...tools.keys()].join(", ");
      return {
        id: call.id,
        ok: false,
        content: `未知工具 "${call.name}"。可用的工具：${available}`,
      };
    }
    const args = parseArguments(call.arguments);
    if (!args.ok) {
      return { id: call.id, ok: false, content: args.error };
    }
    const requestOptions: { signal?: AbortSignal; timeout?: number } = {};
    if (callOptions?.signal !== undefined) requestOptions.signal = callOptions.signal;
    if (options.timeoutMs !== undefined) requestOptions.timeout = options.timeoutMs;

    let result: McpToolResult;
    try {
      result = await source.callTool(
        { name: tool.remoteName, arguments: args.value },
        requestOptions,
      );
    } catch (error) {
      // 取消要继续抛：harness 用"第一个结果为准"把这次调用记成 cancelled。
      // 转成 ok:false 会让模型以为工具真的失败了，并可能再试一次。
      if (callOptions?.signal?.aborted === true) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      return { id: call.id, ok: false, content: `工具执行失败：${message}` };
    }
    return { id: call.id, ...renderResult(result) };
  }

  return { schemas, dispatch };
}

function parametersOf(inputSchema: unknown): Record<string, unknown> {
  if (!isRecord(inputSchema)) {
    return { type: "object", properties: {} };
  }
  // 拷贝后再删：$schema 是 JSON Schema 的元数据，有的模型服务商会拒收不认识的关键字。
  // 不改服务器返回的原对象，listTools 的缓存可能还指着它。
  const copy = structuredClone(inputSchema);
  delete copy["$schema"];
  return copy;
}

function parseArguments(
  raw: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "参数不是合法的 JSON" };
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: "参数必须是 JSON 对象" };
  }
  return { ok: true, value: parsed };
}

function renderResult(result: McpToolResult): { ok: boolean; content: string } {
  const parts: string[] = [];
  for (const block of result.content) {
    if (block.type === "text") {
      if (block.text !== undefined && block.text !== "") parts.push(block.text);
    } else {
      // 图片、音频、资源块 harness 只能交字符串。留下类型，让模型知道这里有东西，而不是静默丢掉。
      parts.push(`[${block.type}]`);
    }
  }
  if (result.structuredContent !== undefined) {
    parts.push(JSON.stringify(result.structuredContent));
  }
  const content = parts.join("\n");
  return {
    ok: result.isError !== true,
    content: content === "" ? "（没有内容）" : content,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
