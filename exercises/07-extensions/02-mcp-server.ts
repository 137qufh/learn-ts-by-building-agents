/**
 * 练习 7-2：一个笔记 MCP 服务器
 *
 * 课程：chapters/07-extensions/02-mcp-server.md
 * 运行：pnpm ex 02-mcp-server
 *
 * createNotesServer() 返回一个还没 connect 的 McpServer。每次调用有自己的笔记列表，互不影响。
 *
 * 工具 add_note：参数 text（非空字符串）和可选的 tags（字符串数组）。
 *   成功时文本是 "已保存 n1"、"已保存 n2"……id 从 n1 开始。
 *   没给 tags 就当成空数组。text 为空时 SDK 会在调用处理函数之前拒绝，笔记不会增加。
 * 工具 list_notes：可选参数 tag。不给 tag 列出全部；给了就只留 tags 里包含它的笔记。
 *   每条一行："n1 [a,b] 文本"。没有匹配时文本是 "（没有笔记）"。
 * 工具 get_note：参数 id。没有这条笔记时 isError 为 true，文本是 "没有笔记 n9"，不要抛异常。
 *   找到了就用和 list 同一行的格式。
 * 资源 catalog：URI 是 notes://catalog，mimeType 是 text/plain，正文和列出全部笔记相同。
 */
import type { McpServer } from "@modelcontextprotocol/server";
import { todo } from "../todo.ts";

export function createNotesServer(): McpServer {
  return todo("实现 createNotesServer");
}
