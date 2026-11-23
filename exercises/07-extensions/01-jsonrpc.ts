/**
 * 练习 7-1：MCP 底下的 JSON-RPC，以及带服务器前缀的工具名
 *
 * 课程：chapters/07-extensions/01-mcp-protocol.md
 * 运行：pnpm ex 01-jsonrpc
 *
 * MCP 的每条消息都是一行 JSON-RPC 2.0。模型、服务器都不可信，所以先解析再使用，不要 as。
 *
 * parseJsonRpc(line) 返回 { ok: true, message } 或 { ok: false, error }，不要抛异常。
 * message 是下面四种之一（kind 用来区分）：
 * - request：有 method（非空字符串）和 id（字符串或有限数字，不能是 null）。可以有 params。
 *   有 method 就不能再有 result 或 error。
 * - notification：有 method，没有 id。同样不能有 result 或 error。
 * - success：没有 method，有 result，id 是字符串、有限数字或 null。
 * - failure：没有 method，有 error。error 必须是对象，code 是有限数字，message 是字符串。
 *   只保留 code 和 message。
 * 有 params 才写 params 属性，没有就不要写（exactOptionalPropertyTypes）。
 * 失败时的 error 文案：
 * - JSON.parse 失败："不是合法的 JSON"
 * - 不是对象（数组、null、数字都不行）："JSON-RPC 消息必须是对象"
 * - jsonrpc 不是 "2.0"：'jsonrpc 必须是 "2.0"'
 * - method 不是非空字符串："method 必须是非空字符串"
 * - 有 method 又有 result 或 error："请求不能同时带 result 或 error"
 * - 请求的 id 不合格："请求的 id 必须是字符串或数字"
 * - 既没有 method 也没有 result 或 error："缺少 method、result 或 error"
 * - result 和 error 都有："响应不能同时带 result 和 error"
 * - 响应的 id 不合格："响应的 id 必须是字符串、数字或 null"
 * - error 形状不对："error 必须包含数字 code 和字符串 message"
 *
 * 工具名：不同 MCP 服务器可能都有 search。qualifyToolName("notes", "search") 得到 "notes__search"。
 * server 或 tool 为空，或者 server 自己含有 "__"，抛出 Error。
 * splitToolName 按第一次出现的 "__" 切开（和第 2 章的 infer 一样）：
 * "notes__search" → { server: "notes", tool: "search" }
 * "a__b__c" → { server: "a", tool: "b__c" }
 * 没有分隔符、server 为空或 tool 为空时返回 undefined。
 *
 * SplitToolName<N> 用模板字面量类型做同样的事，切不开时是 never。
 * QualifiedName<Server, Tool> 是 `${Server}__${Tool}`。
 */
import type { Todo } from "../todo.ts";
import { todo } from "../todo.ts";

export type JsonRpcMessage =
  | { kind: "request"; id: string | number; method: string; params?: unknown }
  | { kind: "notification"; method: string; params?: unknown }
  | { kind: "success"; id: string | number | null; result: unknown }
  | {
      kind: "failure";
      id: string | number | null;
      error: { code: number; message: string };
    };

export type ParseResult = { ok: true; message: JsonRpcMessage } | { ok: false; error: string };

export function parseJsonRpc(line: string): ParseResult {
  return todo("实现 parseJsonRpc");
}

export function qualifyToolName(server: string, tool: string): string {
  return todo("实现 qualifyToolName");
}

export function splitToolName(name: string): { server: string; tool: string } | undefined {
  return todo("实现 splitToolName");
}

export type QualifiedName<Server extends string, Tool extends string> = Todo;

export type SplitToolName<Name extends string> = Todo;
