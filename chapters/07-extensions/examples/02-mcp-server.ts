// 7.2 注册工具、资源和提示
// 运行：node chapters/07-extensions/examples/02-mcp-server.ts
//
// 预期输出：
// invalid true 0
// saved 已保存 牛奶
// about a notes server
// prompt Summarize milk

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

let saved = 0;
const server = new McpServer({ name: "notes", version: "1.0.0" });
server.registerTool(
  "add_note",
  { description: "保存笔记", inputSchema: z.object({ text: z.string().min(1) }) },
  async ({ text }) => {
    saved += 1;
    return { content: [{ type: "text" as const, text: `已保存 ${text}` }] };
  },
);
server.registerResource(
  "about",
  "notes://about",
  { title: "关于", mimeType: "text/plain" },
  async (uri) => ({ contents: [{ uri: uri.href, text: "a notes server" }] }),
);
server.registerPrompt(
  "summarize",
  { description: "总结", argsSchema: z.object({ topic: z.string() }) },
  ({ topic }) => ({
    messages: [
      { role: "user" as const, content: { type: "text" as const, text: `Summarize ${topic}` } },
    ],
  }),
);

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: "example", version: "0.0.0" });
await client.connect(clientTransport);

const invalid = await client.callTool({ name: "add_note", arguments: { text: "" } });
console.log("invalid", invalid.isError === true, saved);
const ok = await client.callTool({ name: "add_note", arguments: { text: "牛奶" } });
const okText = ok.content.find((block) => block.type === "text");
console.log("saved", okText !== undefined && "text" in okText ? okText.text : "");
const about = await client.readResource({ uri: "notes://about" });
const aboutPart = about.contents[0];
console.log("about", aboutPart !== undefined && "text" in aboutPart ? aboutPart.text : "");
const prompt = await client.getPrompt({ name: "summarize", arguments: { topic: "milk" } });
const block = prompt.messages[0]?.content;
console.log("prompt", block !== undefined && "text" in block ? block.text : "");

await client.close();
await server.close();
