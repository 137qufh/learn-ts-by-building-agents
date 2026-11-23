// 7.3 客户端：stdio 子进程。第二轮把模型给的 JSON 字符串解析成对象再 callTool，
// 这是适配器交给 harness 之前要做的那一步。
// 运行：node chapters/07-extensions/examples/03-mcp-client.ts
//
// 预期输出：
// version 2025-11-25
// timeout 60000
// banner notes server ready
// sum 3
// agent 42
// auto 2026-07-28 modern

import { fileURLToPath } from "node:url";
import { Client, DEFAULT_REQUEST_TIMEOUT_MSEC } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("./bin/notes-server.ts", import.meta.url))],
  stderr: "pipe",
});
let banner = "";
transport.stderr?.on("data", (chunk: string | Buffer) => {
  banner += typeof chunk === "string" ? chunk : chunk.toString("utf8");
});

const client = new Client({ name: "example", version: "0.0.0" });
await client.connect(transport);
const direct = await client.callTool({ name: "add", arguments: { a: 1, b: 2 } });
const directText = direct.content.find((block) => block.type === "text");
console.log("version", client.getNegotiatedProtocolVersion());
console.log("timeout", DEFAULT_REQUEST_TIMEOUT_MSEC);
console.log("banner", banner.trim());
console.log("sum", directText !== undefined && "text" in directText ? directText.text : "");

// 模型给的 arguments 是字符串。服务器要的是对象。适配器做的就是这一步。
const raw = '{"a":20,"b":22}';
const args: unknown = JSON.parse(raw);
const argumentsObject: Record<string, unknown> =
  typeof args === "object" && args !== null && !Array.isArray(args)
    ? { ...(args as Record<string, unknown>) }
    : {};
const viaHarness = await client.callTool({
  name: "add",
  arguments: argumentsObject,
});
const viaText = viaHarness.content.find((block) => block.type === "text");
console.log("agent", viaText !== undefined && "text" in viaText ? viaText.text : "");
await client.close();

const autoTransport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("./bin/notes-server.ts", import.meta.url))],
  stderr: "pipe",
});
const autoClient = new Client(
  { name: "example", version: "0.0.0" },
  { versionNegotiation: { mode: "auto" } },
);
await autoClient.connect(autoTransport);
console.log("auto", autoClient.getNegotiatedProtocolVersion(), autoClient.getProtocolEra());
await autoClient.close();
