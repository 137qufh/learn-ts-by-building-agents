import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type { McpServer } from "@modelcontextprotocol/server";
import { describe, expect, test } from "vitest";
import { createNotesServer } from "./02-mcp-server.ts";

async function withClient(
  server: McpServer,
  run: (client: Client) => Promise<void>,
): Promise<void> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "exercise", version: "0.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

describe("createNotesServer", () => {
  test("保存、列出、按 id 读取；空文本不会被保存", async () => {
    await withClient(createNotesServer(), async (client) => {
      expect((await client.callTool({ name: "list_notes", arguments: {} })).content).toEqual([
        { type: "text", text: "（没有笔记）" },
      ]);
      const saved = await client.callTool({
        name: "add_note",
        arguments: { text: "买牛奶", tags: ["购物"] },
      });
      expect(saved.content).toEqual([{ type: "text", text: "已保存 n1" }]);
      expect(saved.isError).toBeUndefined();
      const listed = await client.callTool({ name: "list_notes", arguments: {} });
      expect(listed.content).toEqual([{ type: "text", text: "n1 [购物] 买牛奶" }]);
      const got = await client.callTool({ name: "get_note", arguments: { id: "n1" } });
      expect(got.content).toEqual([{ type: "text", text: "n1 [购物] 买牛奶" }]);

      const empty = await client.callTool({ name: "add_note", arguments: { text: "" } });
      expect(empty.isError).toBe(true);
      const after = await client.callTool({ name: "list_notes", arguments: {} });
      expect(after.content).toEqual([{ type: "text", text: "n1 [购物] 买牛奶" }]);
    });
  });

  test("不给 tags 就是空数组；按标签过滤；没有的 id 是 isError 而不是抛出", async () => {
    await withClient(createNotesServer(), async (client) => {
      await client.callTool({ name: "add_note", arguments: { text: "买面包" } });
      await client.callTool({
        name: "add_note",
        arguments: { text: "开会", tags: ["工作"] },
      });
      const all = await client.callTool({ name: "list_notes", arguments: {} });
      expect(all.content).toEqual([{ type: "text", text: "n1 [] 买面包\nn2 [工作] 开会" }]);
      const work = await client.callTool({ name: "list_notes", arguments: { tag: "工作" } });
      expect(work.content).toEqual([{ type: "text", text: "n2 [工作] 开会" }]);
      const none = await client.callTool({ name: "list_notes", arguments: { tag: "没有" } });
      expect(none.content).toEqual([{ type: "text", text: "（没有笔记）" }]);
      const missing = await client.callTool({ name: "get_note", arguments: { id: "n9" } });
      expect(missing.isError).toBe(true);
      expect(missing.content).toEqual([{ type: "text", text: "没有笔记 n9" }]);
    });
  });

  test("资源 catalog 读出全部笔记；两个服务器不共享状态", async () => {
    const first = createNotesServer();
    const second = createNotesServer();
    await withClient(first, async (client) => {
      await client.callTool({ name: "add_note", arguments: { text: "只在第一个" } });
      const read = await client.readResource({ uri: "notes://catalog" });
      expect(read.contents).toEqual([
        { uri: "notes://catalog", mimeType: "text/plain", text: "n1 [] 只在第一个" },
      ]);
    });
    await withClient(second, async (client) => {
      const read = await client.readResource({ uri: "notes://catalog" });
      expect(read.contents[0]).toMatchObject({ text: "（没有笔记）" });
    });
  });
});
