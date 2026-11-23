// 7.3 的 stdio 服务器。不要放在 examples/*.ts：那个目录会被逐个执行。
// stdout 只留给协议。日志走 stderr。
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

function createServer(): McpServer {
  const server = new McpServer({ name: "calc", version: "1.0.0" });
  server.registerTool(
    "add",
    { description: "两数相加", inputSchema: z.object({ a: z.number(), b: z.number() }) },
    async ({ a, b }) => ({ content: [{ type: "text" as const, text: String(a + b) }] }),
  );
  return server;
}

console.error("notes server ready");
serveStdio(createServer);
