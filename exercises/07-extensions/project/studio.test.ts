import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import { createScriptedModel } from "@learn-ts/agent-kit/testing";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { mergeTools, runStudio } from "./studio.ts";

describe("mergeTools", () => {
  test("重名在合成时抛出；未知工具列出可用的名字", async () => {
    const one = {
      schemas: () => [{ name: "a", description: "a", parameters: { type: "object" } }],
      dispatch: (call: { id: string }) => Promise.resolve({ id: call.id, ok: true, content: "a" }),
    };
    expect(() => mergeTools([one, one])).toThrow(/a/);
    const merged = mergeTools([one]);
    const unknown = await merged.dispatch({ id: "1", name: "b", arguments: "{}" });
    expect(unknown.ok).toBe(false);
    expect(unknown.content).toContain("a");
  });
});

describe("runStudio", () => {
  test("MCP 笔记、记忆和子 agent 在同一次运行里", async () => {
    const notes: string[] = [];
    const server = new McpServer({ name: "notes", version: "1.0.0" });
    server.registerTool(
      "add_note",
      { description: "保存", inputSchema: z.object({ text: z.string() }) },
      async ({ text }) => {
        notes.push(text);
        return { content: [{ type: "text" as const, text: "已保存" }] };
      },
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "studio", version: "0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const model = createScriptedModel([
      {
        toolCalls: [
          { name: "notes__add_note", arguments: { text: "买牛奶" } },
          { name: "remember", arguments: { text: "偏好低脂" } },
        ],
      },
      {
        toolCalls: [
          { name: "recall", arguments: { query: "低脂" } },
          { name: "summarize", arguments: { task: "把这件事收成一句" } },
        ],
      },
      { text: "已经记好了" },
    ]);
    const summarizer = createScriptedModel([{ text: "一句总结" }]);
    try {
      const result = await runStudio({ model, summarizer, client, task: "记下买牛奶" });
      expect(result).toMatchObject({
        text: "已经记好了",
        stopType: "completed",
        remembered: ["偏好低脂"],
        toolNames: ["notes__add_note", "remember", "recall", "summarize"],
      });
      expect(notes).toEqual(["买牛奶"]);
      expect(summarizer.requests[0]?.messages).toEqual([
        { role: "system", content: "用一句话总结用户给出的任务，不要调用工具。" },
        { role: "user", content: "把这件事收成一句" },
      ]);
      expect(
        model.requests[2]?.messages
          .filter((message) => message.role === "tool")
          .map((message) => message.content),
      ).toEqual(["已保存", "已记住", "偏好低脂", "一句总结"]);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
