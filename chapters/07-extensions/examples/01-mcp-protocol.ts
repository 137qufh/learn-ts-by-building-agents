// 7.1 MCP 协议长什么样
// 运行：node chapters/07-extensions/examples/01-mcp-protocol.ts
//
// 先看一行 JSON-RPC，再连一个进程内的服务器，打印协商到的协议版本。
// 预期输出：
// request tools/list 1
// notification notifications/initialized
// latest constant 2025-11-25
// supported has 2026-07-28? false
// version 2025-11-25 legacy
// tools add
// 1+2=3

import {
  Client,
  InMemoryTransport,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const request: unknown = JSON.parse('{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}');
const notification: unknown = JSON.parse('{"jsonrpc":"2.0","method":"notifications/initialized"}');
if (isObject(request) && request["method"] === "tools/list") {
  console.log("request", request["method"], request["id"]);
}
if (isObject(notification) && !("id" in notification)) {
  console.log("notification", notification["method"]);
}

const server = new McpServer({ name: "calc", version: "1.0.0" });
server.registerTool(
  "add",
  { description: "两数相加", inputSchema: z.object({ a: z.number(), b: z.number() }) },
  async ({ a, b }) => ({ content: [{ type: "text" as const, text: String(a + b) }] }),
);

// 一对传输必须来自同一个包。client 和 server 各拿一头。
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: "example", version: "0.0.0" });
await client.connect(clientTransport);

const listed = await client.listTools();
const sum = await client.callTool({ name: "add", arguments: { a: 1, b: 2 } });
const text = sum.content.find((block) => block.type === "text");
console.log("latest constant", LATEST_PROTOCOL_VERSION);
console.log("supported has 2026-07-28?", SUPPORTED_PROTOCOL_VERSIONS.includes("2026-07-28"));
console.log("version", client.getNegotiatedProtocolVersion(), client.getProtocolEra());
console.log("tools", listed.tools.map((tool) => tool.name).join(","));
console.log("1+2=" + (text !== undefined && "text" in text ? text.text : ""));

await client.close();
await server.close();

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
