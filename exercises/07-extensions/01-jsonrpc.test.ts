import { describe, expect, test } from "vitest";
import { parseJsonRpc, qualifyToolName, splitToolName } from "./01-jsonrpc.ts";

describe("parseJsonRpc", () => {
  test("请求、通知、成功和失败", () => {
    expect(parseJsonRpc('{"jsonrpc":"2.0","id":1,"method":"tools/list"}')).toEqual({
      ok: true,
      message: { kind: "request", id: 1, method: "tools/list" },
    });
    expect(
      parseJsonRpc('{"jsonrpc":"2.0","id":"a","method":"tools/call","params":{"name":"add"}}'),
    ).toEqual({
      ok: true,
      message: { kind: "request", id: "a", method: "tools/call", params: { name: "add" } },
    });
    expect(parseJsonRpc('{"jsonrpc":"2.0","method":"notifications/initialized"}')).toEqual({
      ok: true,
      message: { kind: "notification", method: "notifications/initialized" },
    });
    expect(parseJsonRpc('{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}')).toEqual({
      ok: true,
      message: { kind: "success", id: 1, result: { tools: [] } },
    });
    expect(
      parseJsonRpc('{"jsonrpc":"2.0","id":null,"error":{"code":-32601,"message":"nope","data":1}}'),
    ).toEqual({
      ok: true,
      message: { kind: "failure", id: null, error: { code: -32601, message: "nope" } },
    });
  });

  test("不信任输入：坏 JSON、错误形状、id 和 error 都不合格", () => {
    expect(parseJsonRpc("")).toEqual({ ok: false, error: "不是合法的 JSON" });
    expect(parseJsonRpc("[]")).toEqual({ ok: false, error: "JSON-RPC 消息必须是对象" });
    expect(parseJsonRpc("null")).toEqual({ ok: false, error: "JSON-RPC 消息必须是对象" });
    expect(parseJsonRpc('{"jsonrpc":"1.0","id":1,"method":"x"}')).toEqual({
      ok: false,
      error: 'jsonrpc 必须是 "2.0"',
    });
    expect(parseJsonRpc('{"jsonrpc":"2.0","id":1,"method":""}')).toEqual({
      ok: false,
      error: "method 必须是非空字符串",
    });
    expect(parseJsonRpc('{"jsonrpc":"2.0","id":1,"method":"x","result":1}')).toEqual({
      ok: false,
      error: "请求不能同时带 result 或 error",
    });
    expect(parseJsonRpc('{"jsonrpc":"2.0","id":null,"method":"x"}')).toEqual({
      ok: false,
      error: "请求的 id 必须是字符串或数字",
    });
    expect(parseJsonRpc('{"jsonrpc":"2.0","id":true,"method":"x"}')).toEqual({
      ok: false,
      error: "请求的 id 必须是字符串或数字",
    });
    expect(parseJsonRpc('{"jsonrpc":"2.0"}')).toEqual({
      ok: false,
      error: "缺少 method、result 或 error",
    });
    expect(
      parseJsonRpc('{"jsonrpc":"2.0","id":1,"result":1,"error":{"code":1,"message":"e"}}'),
    ).toEqual({
      ok: false,
      error: "响应不能同时带 result 和 error",
    });
    expect(parseJsonRpc('{"jsonrpc":"2.0","result":1}')).toEqual({
      ok: false,
      error: "响应的 id 必须是字符串、数字或 null",
    });
    expect(parseJsonRpc('{"jsonrpc":"2.0","id":1,"error":{"code":"1","message":"e"}}')).toEqual({
      ok: false,
      error: "error 必须包含数字 code 和字符串 message",
    });
  });

  test("没有 params 时结果里不出现这个属性", () => {
    const parsed = parseJsonRpc('{"jsonrpc":"2.0","method":"ping"}');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.message).not.toHaveProperty("params");
  });
});

describe("工具名", () => {
  test("组合和拆开，第一次出现的 __ 才是分界", () => {
    expect(qualifyToolName("notes", "search")).toBe("notes__search");
    expect(splitToolName("notes__search")).toEqual({ server: "notes", tool: "search" });
    expect(splitToolName("a__b__c")).toEqual({ server: "a", tool: "b__c" });
    expect(splitToolName("search")).toBeUndefined();
    expect(splitToolName("__search")).toBeUndefined();
    expect(splitToolName("notes__")).toBeUndefined();
  });

  test("空名字和含有分隔符的服务器名不能组合", () => {
    expect(() => qualifyToolName("", "search")).toThrow(Error);
    expect(() => qualifyToolName("notes", "")).toThrow(Error);
    expect(() => qualifyToolName("a__b", "search")).toThrow(Error);
  });
});
