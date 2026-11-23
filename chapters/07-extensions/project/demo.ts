// 第 7 章演示：进程内的 MCP 笔记、一条记忆、一次子 agent 总结。
//
// 运行：pnpm tsx --conditions=@learn-ts/source chapters/07-extensions/project/demo.ts
//
// 默认不需要网络。设置 OPENAI_API_KEY 和 OPENAI_MODEL（可选 OPENAI_BASE_URL）时改用真正的模型，
// 这时工具轨迹不固定，程序只把事件打出来。

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import {
  createAgent,
  createClient,
  createMcpExecutor,
  createRetriever,
  delegate,
  mergeTools,
  parentSummary,
  type Model,
  type ToolExecutor,
} from "@learn-ts/agent-kit";
import { createScriptedModel } from "@learn-ts/agent-kit/testing";
import { z } from "zod";

const notes: string[] = [];
const server = new McpServer({ name: "notes", version: "1.0.0" });
server.registerTool(
  "add_note",
  { description: "保存一条笔记", inputSchema: z.object({ text: z.string().min(1) }) },
  async ({ text }) => {
    notes.push(text);
    return { content: [{ type: "text" as const, text: `已保存 ${text}` }] };
  },
);
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "demo", version: "0.4.0" });
await server.connect(serverTransport);
await client.connect(clientTransport);

const live =
  (process.env["OPENAI_API_KEY"] ?? "") !== "" && (process.env["OPENAI_MODEL"] ?? "") !== "";
const model: Model = live
  ? createClient({
      baseUrl: process.env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1",
      apiKey: process.env["OPENAI_API_KEY"] ?? "",
      model: process.env["OPENAI_MODEL"] ?? "",
    })
  : createScriptedModel([
      {
        text: "我先记下笔记，并记住偏好。",
        toolCalls: [
          { name: "notes__add_note", arguments: { text: "买牛奶" } },
          { name: "remember", arguments: { text: "偏好低脂" } },
        ],
      },
      {
        text: "再查一下记忆，并请子 agent 总结。",
        toolCalls: [
          { name: "recall", arguments: { query: "低脂" } },
          { name: "summarize", arguments: { task: "把买牛奶收成一句" } },
        ],
      },
      { text: "已经记好了：买低脂牛奶。" },
    ]);
const summarizerAgent = createAgent({
  model: live ? model : createScriptedModel([{ text: "买低脂牛奶。" }]),
  system: "用一句话总结用户给出的任务，不要调用工具。",
});

const retriever = createRetriever({ dimensions: 32 });
const remembered: string[] = [];
const local: ToolExecutor = {
  schemas: () => [
    {
      name: "remember",
      description: "记住一条事实",
      parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    },
    {
      name: "recall",
      description: "查找记住的事实",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
    {
      name: "summarize",
      description: "让子 agent 用一句话总结",
      parameters: { type: "object", properties: { task: { type: "string" } }, required: ["task"] },
    },
  ],
  async dispatch(call) {
    const value: unknown = JSON.parse(call.arguments);
    const args = typeof value === "object" && value !== null ? value : {};
    const field = (key: string): string => {
      const item = (args as Record<string, unknown>)[key];
      return typeof item === "string" ? item : "";
    };
    if (call.name === "remember") {
      const text = field("text");
      retriever.add(text);
      remembered.push(text);
      return { id: call.id, ok: true, content: "已记住" };
    }
    if (call.name === "recall") {
      const hits = retriever.search(field("query"), 3);
      return {
        id: call.id,
        ok: true,
        content: hits.length === 0 ? "没有找到" : hits.map((hit) => hit.text).join("\n"),
      };
    }
    const result = await delegate(summarizerAgent, field("task"));
    return { id: call.id, ok: true, content: parentSummary(result) };
  },
};

const agent = createAgent({
  model,
  tools: mergeTools([await createMcpExecutor(client, { prefix: "notes" }), local]),
  system: "你是笔记助手。需要保存、回忆或总结时使用工具。",
});

const run = agent.run("记下要买牛奶，用户偏好低脂，最后总结一句。");
for await (const event of run) {
  if (event.type === "text") process.stdout.write(event.text);
  if (event.type === "tool_call") console.log(`\n  → ${event.call.name} ${event.call.arguments}`);
  if (event.type === "tool_result") console.log(`  ✓ ${event.result.name} ${event.result.content}`);
}
const result = await run.result;
console.log(`\n\n结束：${result.stopReason.type}`);
console.log("笔记", notes.join(" | "));
console.log("记住", remembered.join(" | "));

await client.close();
await server.close();
