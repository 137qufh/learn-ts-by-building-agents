/**
 * 练习 7-1 参考答案：解析 JSON-RPC，拆开带前缀的工具名
 */

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
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { ok: false, error: "不是合法的 JSON" };
  }
  if (!isRecord(value)) {
    return { ok: false, error: "JSON-RPC 消息必须是对象" };
  }
  if (value["jsonrpc"] !== "2.0") {
    return { ok: false, error: 'jsonrpc 必须是 "2.0"' };
  }

  const hasMethod = "method" in value;
  const hasResult = "result" in value;
  const hasError = "error" in value;
  if (hasMethod) {
    const method = value["method"];
    if (typeof method !== "string" || method === "") {
      return { ok: false, error: "method 必须是非空字符串" };
    }
    if (hasResult || hasError) {
      return { ok: false, error: "请求不能同时带 result 或 error" };
    }
    if ("id" in value) {
      if (!isId(value["id"])) {
        return { ok: false, error: "请求的 id 必须是字符串或数字" };
      }
      return { ok: true, message: withParams({ kind: "request", id: value["id"], method }, value) };
    }
    return { ok: true, message: withParams({ kind: "notification", method }, value) };
  }

  if (hasResult && hasError) {
    return { ok: false, error: "响应不能同时带 result 和 error" };
  }
  if (!hasResult && !hasError) {
    return { ok: false, error: "缺少 method、result 或 error" };
  }
  if (!("id" in value) || !isResponseId(value["id"])) {
    return { ok: false, error: "响应的 id 必须是字符串、数字或 null" };
  }
  const id = value["id"];
  if (hasResult) {
    return { ok: true, message: { kind: "success", id, result: value["result"] } };
  }
  const error = value["error"];
  if (
    !isRecord(error) ||
    typeof error["code"] !== "number" ||
    !Number.isFinite(error["code"]) ||
    typeof error["message"] !== "string"
  ) {
    return { ok: false, error: "error 必须包含数字 code 和字符串 message" };
  }
  return {
    ok: true,
    message: { kind: "failure", id, error: { code: error["code"], message: error["message"] } },
  };
}

export function qualifyToolName(server: string, tool: string): string {
  if (server === "" || tool === "" || server.includes("__")) {
    throw new Error(`无法组合工具名：server="${server}" tool="${tool}"`);
  }
  return `${server}__${tool}`;
}

export function splitToolName(name: string): { server: string; tool: string } | undefined {
  const index = name.indexOf("__");
  // index 为 0 表示 server 是空的（"__search"）。没有分隔符时 index 是 -1。
  if (index <= 0) return undefined;
  const tool = name.slice(index + 2);
  if (tool === "") return undefined;
  return { server: name.slice(0, index), tool };
}

export type QualifiedName<Server extends string, Tool extends string> = `${Server}__${Tool}`;

export type SplitToolName<Name extends string> = Name extends `${infer Server}__${infer Tool}`
  ? Server extends ""
    ? never
    : Tool extends ""
      ? never
      : { server: Server; tool: Tool }
  : never;

function withParams<T extends object>(base: T, value: Record<string, unknown>): T {
  if (!("params" in value)) return base;
  return { ...base, params: value["params"] };
}

function isId(value: unknown): value is string | number {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

function isResponseId(value: unknown): value is string | number | null {
  return value === null || isId(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
