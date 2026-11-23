import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import { describe, expect, expectTypeOf, test } from "vitest";
import { z } from "zod";
import { createMcpExecutor, type McpToolResult, type McpToolSource } from "./03-mcp-client.ts";

function sourceOf(
  tools: McpToolSource["listTools"] extends () => Promise<{ tools: infer T }> ? T : never,
  call: McpToolSource["callTool"],
): McpToolSource {
  return { listTools: () => Promise.resolve({ tools }), callTool: call };
}

describe("createMcpExecutor", () => {
  test("前缀、schema 拷贝、错误参数和 isError", async () => {
    const original = {
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
      $schema: "https://json-schema.org/draft/2020-12/schema",
    };
    const seen: {
      name?: string | undefined;
      timeout?: number | undefined;
      args?: Record<string, unknown> | undefined;
    } = {};
    const executor = await createMcpExecutor(
      sourceOf(
        [
          { name: "search", description: "搜索", inputSchema: original },
          { name: "ping", inputSchema: undefined },
        ],
        (params, options) => {
          seen.name = params.name;
          seen.timeout = options?.timeout;
          seen.args = params.arguments;
          const result: McpToolResult = {
            content: [{ type: "text", text: "找到了" }],
            structuredContent: { n: 1 },
          };
          return Promise.resolve(result);
        },
      ),
      { prefix: "notes", timeoutMs: 5_000 },
    );

    const schemas = executor.schemas();
    expect(schemas.map((schema) => schema.name)).toEqual(["notes__search", "notes__ping"]);
    expect(schemas[0]?.parameters).toEqual({
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
    });
    expect(original).toHaveProperty("$schema");
    const first = schemas[0];
    if (first === undefined) throw new Error("missing schema");
    first.parameters["required"] = [];
    expect(executor.schemas()[0]?.parameters).toHaveProperty("required", ["q"]);
    expect(schemas[1]?.description).toBe("ping");
    expect(schemas[1]?.parameters).toEqual({ type: "object", properties: {} });

    const ok = await executor.dispatch({
      id: "c1",
      name: "notes__search",
      arguments: '{"q":"牛奶"}',
    });
    expect(ok).toEqual({ id: "c1", ok: true, content: '找到了\n{"n":1}' });
    expect(seen).toEqual({ name: "search", timeout: 5_000, args: { q: "牛奶" } });

    expect(await executor.dispatch({ id: "c2", name: "notes__search", arguments: "{bad" })).toEqual(
      { id: "c2", ok: false, content: "参数不是合法的 JSON" },
    );
    expect(await executor.dispatch({ id: "c3", name: "notes__search", arguments: "[1]" })).toEqual({
      id: "c3",
      ok: false,
      content: "参数必须是 JSON 对象",
    });
    const unknown = await executor.dispatch({ id: "c4", name: "other", arguments: "{}" });
    expect(unknown.ok).toBe(false);
    expect(unknown.content).toContain("other");
    expect(unknown.content).toContain("notes__search");
  });

  test("isError、非文本块、空结果；取消继续抛，其他错误收成文本", async () => {
    const executor = await createMcpExecutor({
      listTools: () =>
        Promise.resolve({
          tools: [
            { name: "a", description: "a" },
            { name: "b", description: "b" },
          ],
        }),
      callTool: (params, options) => {
        if (options?.signal?.aborted === true) {
          throw new Error("AbortError: This operation was aborted");
        }
        if (params.name === "a") {
          return Promise.resolve({
            content: [
              { type: "text", text: "不行" },
              { type: "image", text: undefined },
            ],
            isError: true,
          });
        }
        throw new Error("disk full");
      },
    });
    expect(await executor.dispatch({ id: "1", name: "a", arguments: "{}" })).toEqual({
      id: "1",
      ok: false,
      content: "不行\n[image]",
    });
    expect(await executor.dispatch({ id: "2", name: "b", arguments: "{}" })).toEqual({
      id: "2",
      ok: false,
      content: "工具执行失败：disk full",
    });
    const empty = await createMcpExecutor({
      listTools: () => Promise.resolve({ tools: [{ name: "z", description: "z" }] }),
      callTool: () => Promise.resolve({ content: [] }),
    });
    expect(await empty.dispatch({ id: "3", name: "z", arguments: "{}" })).toEqual({
      id: "3",
      ok: true,
      content: "（没有内容）",
    });
    const signal = AbortSignal.abort();
    await expect(
      executor.dispatch({ id: "4", name: "a", arguments: "{}" }, { signal }),
    ).rejects.toThrow(/AbortError/);
  });

  test("前缀含 __ 或工具名重复时抛出", async () => {
    await expect(
      createMcpExecutor(
        { listTools: () => Promise.resolve({ tools: [] }), callTool: () => Promise.reject() },
        { prefix: "a__b" },
      ),
    ).rejects.toThrow(/__/);
    await expect(
      createMcpExecutor({
        listTools: () =>
          Promise.resolve({
            tools: [
              { name: "a", description: "1" },
              { name: "a", description: "2" },
            ],
          }),
        callTool: () => Promise.reject(),
      }),
    ).rejects.toThrow(/重复/);
  });

  test("官方 Client 能用，非法参数不会进入处理函数", async () => {
    let calls = 0;
    const server = new McpServer({ name: "notes", version: "1.0.0" });
    server.registerTool(
      "add",
      { description: "相加", inputSchema: z.object({ n: z.number() }) },
      async ({ n }) => {
        calls += 1;
        return { content: [{ type: "text" as const, text: String(n + 1) }] };
      },
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "exercise", version: "0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    expectTypeOf(client).toExtend<McpToolSource>();
    try {
      const executor = await createMcpExecutor(client);
      const bad = await executor.dispatch({ id: "1", name: "add", arguments: '{"n":"x"}' });
      expect(bad.ok).toBe(false);
      expect(bad.content).toContain("Input validation error");
      expect(calls).toBe(0);
      const good = await executor.dispatch({ id: "2", name: "add", arguments: '{"n":2}' });
      expect(good).toEqual({ id: "2", ok: true, content: "3" });
      expect(calls).toBe(1);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
