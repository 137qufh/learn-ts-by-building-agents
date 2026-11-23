/**
 * 练习 7-3：把 MCP 客户端接到 harness
 *
 * 课程：chapters/07-extensions/03-mcp-client.md
 * 运行：pnpm ex 03-mcp-client
 *
 * createMcpExecutor(source, options?) 先 listTools()，再返回 ToolExecutor（6.1 节的接口）。
 * 官方的 Client 能直接传进来：它的方法比这里多、字段也比这里多，结构化类型不在乎。
 *
 * - prefix 加在工具名前，用 "__" 连接。prefix 自己含有 "__" 就抛出 Error。
 *   不传或空字符串表示不加前缀。暴露出去的名字重复了也抛出 Error。
 * - description 缺了就用工具名。inputSchema 不是对象时，parameters 是 { type: "object", properties: {} }。
 *   是对象时做一次拷贝并删掉 $schema，不要改服务器返回的原对象。
 *   schemas() 每次返回新的拷贝：调用方改返回值，下一次还是原来的。
 * - dispatch 把暴露的名字换回服务器上的名字再 callTool。
 *   未知工具：ok false，content 包含工具名和可用名字。
 *   arguments 不是合法 JSON：ok false，content 是 "参数不是合法的 JSON"。
 *   JSON 不是对象（数组、null、数字）：ok false，content 是 "参数必须是 JSON 对象"。
 * - 结果：text 块按顺序用换行接起来；别的块写成 `[类型]`，不要丢掉。
 *   structuredContent 不是 undefined 时，再追加一行 JSON.stringify 的结果。
 *   什么都没有时 content 是 "（没有内容）"。
 *   isError 为 true 时 ok 是 false，否则 ok 是 true（缺省当成功）。
 * - callTool 抛错：signal 已经 aborted 就继续抛，不要收成 ok:false。
 *   其他错误收成 ok false，content 是 `工具执行失败：${message}`。
 * - timeoutMs 要传给 callTool 的 timeout。不传就不写这个字段。
 */
import type { ToolExecutor } from "@learn-ts/agent-kit";
import { todo } from "../todo.ts";

export interface McpListedTool {
  name: string;
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

export interface McpToolSource {
  listTools(): Promise<{ tools: readonly McpListedTool[] }>;
  callTool(
    params: { name: string; arguments?: Record<string, unknown> },
    options?: { signal?: AbortSignal; timeout?: number },
  ): Promise<McpToolResult>;
}

export interface McpExecutorOptions {
  prefix?: string;
  timeoutMs?: number;
}

export async function createMcpExecutor(
  source: McpToolSource,
  options?: McpExecutorOptions,
): Promise<ToolExecutor> {
  return todo("实现 createMcpExecutor");
}
