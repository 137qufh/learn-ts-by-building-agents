/**
 * 第 6 章项目参考答案：限制在一个目录里的文件工具
 */
import { lstat, mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { defineTool, type AnyZodTool } from "@learn-ts/agent-kit/zod";
import { z } from "zod";

export class SandboxError extends Error {
  override name = "SandboxError";
}

/** target 是否在 root 里面（或者就是 root）。两者都必须是绝对路径。 */
export function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

/** 找到 path 自己或者离它最近的、已经存在的祖先目录，返回它的真实路径。 */
async function realpathOfExisting(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    const parent = dirname(path);
    if (parent === path || !isNotFound(error)) {
      throw error;
    }
    return join(await realpathOfExisting(parent), path.slice(parent.length + 1));
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function resolveInSandbox(root: string, path: string): Promise<string> {
  if (path.trim() === "") {
    throw new SandboxError("路径不能为空");
  }
  if (path.includes("\0")) {
    throw new SandboxError("路径里不能有 NUL 字符");
  }
  const realRoot = await realpath(root);
  const target = resolve(realRoot, path);
  if (!isInside(realRoot, target)) {
    throw new SandboxError(`路径 ${path} 在工作目录之外`);
  }
  // 字面上在里面还不够：符号链接可能指向外面。检查真实路径（文件还不存在时，检查它最近的祖先）
  const real = await realpathOfExisting(target);
  if (!isInside(realRoot, real)) {
    throw new SandboxError(`路径 ${path} 通过符号链接指向了工作目录之外`);
  }
  return real;
}

export interface FileToolOptions {
  allowWrite?: boolean;
  maxFileBytes?: number;
}

const SKIP_DIRS = new Set(["node_modules", ".git"]);
const MAX_LIST = 200;
const MAX_MATCHES = 50;

export function createFileTools(root: string, options: FileToolOptions = {}): AnyZodTool[] {
  const { allowWrite = false, maxFileBytes = 1_000_000 } = options;
  const display = async (absolute: string): Promise<string> =>
    relative(await realpath(root), absolute).replaceAll(sep, "/") || ".";

  async function readText(absolute: string): Promise<string> {
    const info = await stat(absolute);
    if (!info.isFile()) {
      throw new SandboxError(`${await display(absolute)} 不是文件`);
    }
    if (info.size > maxFileBytes) {
      throw new SandboxError(
        `${await display(absolute)} 有 ${info.size} 字节，超过了 ${maxFileBytes} 字节的上限`,
      );
    }
    return readFile(absolute, "utf8");
  }

  const listFiles = defineTool({
    name: "list_files",
    description: "列出工作目录里某个目录的内容。目录名以 / 结尾。",
    parameters: z.object({ path: z.string().default(".").describe("相对于工作目录的路径") }),
    async execute({ path }) {
      const absolute = await resolveInSandbox(root, path);
      const entries = await readdir(absolute, { withFileTypes: true });
      const names = entries
        .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      if (names.length === 0) {
        return "（空目录）";
      }
      const shown = names.slice(0, MAX_LIST).join("\n");
      return names.length > MAX_LIST
        ? `${shown}\n……还有 ${names.length - MAX_LIST} 项没有列出`
        : shown;
    },
  });

  const readFileTool = defineTool({
    name: "read_file",
    description: "读取工作目录里的一个文本文件，每行前面带行号。",
    parameters: z.object({
      path: z.string().min(1).describe("相对于工作目录的路径"),
      startLine: z.number().int().min(1).default(1).describe("从第几行开始，从 1 开始数"),
      maxLines: z.number().int().min(1).max(2000).default(200).describe("最多读多少行"),
    }),
    async execute({ path, startLine, maxLines }) {
      const lines = (await readText(await resolveInSandbox(root, path))).split(/\r?\n/);
      if (lines.at(-1) === "") {
        lines.pop(); // 文件末尾的换行不算一行
      }
      if (lines.length === 0) {
        return "（空文件）";
      }
      if (startLine > lines.length) {
        throw new SandboxError(`文件只有 ${lines.length} 行，startLine 是 ${startLine}`);
      }
      const end = Math.min(lines.length, startLine + maxLines - 1);
      const body = lines
        .slice(startLine - 1, end)
        .map((line, index) => `${startLine + index}: ${line}`)
        .join("\n");
      const whole = startLine === 1 && end === lines.length;
      return whole ? body : `（共 ${lines.length} 行，显示第 ${startLine}-${end} 行）\n${body}`;
    },
  });

  const search = defineTool({
    name: "search",
    description: "在工作目录的文本文件里查找包含某段文字的行（区分大小写）。",
    parameters: z.object({
      query: z.string().min(1).describe("要找的文字"),
      path: z.string().default(".").describe("在哪个目录里找，相对于工作目录"),
    }),
    async execute({ query, path }, { signal }) {
      const start = await resolveInSandbox(root, path);
      const matches: string[] = [];
      let more = false;

      async function walk(dir: string): Promise<void> {
        signal?.throwIfAborted();
        const entries = await readdir(dir, { withFileTypes: true });
        entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        for (const entry of entries) {
          if (more) return;
          const absolute = join(dir, entry.name);
          if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) await walk(absolute);
            continue;
          }
          // 只看普通文件：符号链接可能指向工作目录外面，search 不跟随它们
          if (!entry.isFile() || (await lstat(absolute)).size > maxFileBytes) continue;
          const text = await readFile(absolute, "utf8");
          const lines = text.split(/\r?\n/);
          for (const [index, line] of lines.entries()) {
            if (!line.includes(query)) continue;
            if (matches.length === MAX_MATCHES) {
              more = true;
              return;
            }
            matches.push(`${await display(absolute)}:${index + 1}: ${line.trim()}`);
          }
        }
      }

      const info = await stat(start);
      if (info.isFile()) {
        throw new SandboxError(`${path} 是文件，search 的 path 应该是目录`);
      }
      await walk(start);
      if (matches.length === 0) {
        return `没有找到 "${query}"`;
      }
      return more
        ? `${matches.join("\n")}\n……结果太多，只显示前 ${MAX_MATCHES} 条`
        : matches.join("\n");
    },
  });

  const writeFileTool = defineTool({
    name: "write_file",
    description: "在工作目录里写入一个文本文件（覆盖已有内容），需要时自动创建目录。",
    parameters: z.object({
      path: z.string().min(1).describe("相对于工作目录的路径"),
      content: z.string().describe("完整的文件内容"),
    }),
    async execute({ path, content }) {
      const absolute = await resolveInSandbox(root, path);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, content, "utf8");
      return `已写入 ${await display(absolute)}（${Buffer.byteLength(content)} 字节）`;
    },
  });

  return allowWrite
    ? [listFiles, readFileTool, search, writeFileTool]
    : [listFiles, readFileTool, search];
}
