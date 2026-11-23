/**
 * 练习 7-2 参考答案：笔记 MCP 服务器
 *
 * 状态放在函数里的数组，而不是模块级变量：两个服务器各记各的。
 * 找不到笔记时返回 isError，而不是 throw。throw 也会变成 isError，
 * 但那是"没想到的失败"；找不到是预期的结果，文案要自己写。
 */
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

interface Note {
  id: string;
  text: string;
  tags: string[];
}

export function createNotesServer(): McpServer {
  const notes: Note[] = [];
  let next = 1;
  const server = new McpServer({ name: "notes", version: "1.0.0" });

  server.registerTool(
    "add_note",
    {
      description: "保存一条笔记",
      inputSchema: z.object({
        text: z.string().min(1),
        tags: z.array(z.string()).optional(),
      }),
    },
    async ({ text, tags }) => {
      const note: Note = { id: `n${next}`, text, tags: tags ?? [] };
      next += 1;
      notes.push(note);
      return { content: [{ type: "text" as const, text: `已保存 ${note.id}` }] };
    },
  );

  server.registerTool(
    "list_notes",
    {
      description: "列出笔记，可以按标签过滤",
      inputSchema: z.object({ tag: z.string().optional() }),
    },
    async ({ tag }) => {
      const selected = tag === undefined ? notes : notes.filter((note) => note.tags.includes(tag));
      return { content: [{ type: "text" as const, text: formatNotes(selected) }] };
    },
  );

  server.registerTool(
    "get_note",
    {
      description: "按 id 读取一条笔记",
      inputSchema: z.object({ id: z.string() }),
    },
    async ({ id }) => {
      const note = notes.find((item) => item.id === id);
      if (note === undefined) {
        return { content: [{ type: "text" as const, text: `没有笔记 ${id}` }], isError: true };
      }
      return { content: [{ type: "text" as const, text: formatNote(note) }] };
    },
  );

  server.registerResource(
    "catalog",
    "notes://catalog",
    { title: "全部笔记", mimeType: "text/plain" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/plain", text: formatNotes(notes) }],
    }),
  );

  return server;
}

function formatNote(note: Note): string {
  return `${note.id} [${note.tags.join(",")}] ${note.text}`;
}

function formatNotes(list: readonly Note[]): string {
  if (list.length === 0) return "（没有笔记）";
  return list.map((note) => formatNote(note)).join("\n");
}
