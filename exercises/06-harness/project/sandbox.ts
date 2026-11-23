/**
 * 第 6 章项目：限制在一个目录里的文件工具
 *
 * 课程：chapters/06-harness/09-project-harness.md
 * 运行：pnpm ex project/sandbox
 *
 * 演示里的 agent 是一个"文件助手"：能列目录、读文件、搜索、（允许的话）写文件。模型给出的路径是
 * **不可信的输入**（5.1 节）：它可能是 "../../.ssh/id_rsa"，可能是 "/etc/passwd"，也可能是一个
 * 指向外面的符号链接。工具必须保证只能碰到工作目录里面的东西。
 *
 * 第一部分：isInside(root, target)
 *   两个绝对路径，target 是 root 自己或者在它里面时返回 true。
 *   提示：path.relative(root, target)；结果是 ""、或者不以 ".." + 分隔符开头、不等于 ".."、也不是绝对路径。
 *   小心 "/a/bc" 不在 "/a/b" 里面（只比较字符串前缀是错的），而名字叫 "..c" 的文件在里面。
 *
 * 第二部分：resolveInSandbox(root, path)
 *   - path 去掉空白后为空：SandboxError("路径不能为空")；含有 "\0"：SandboxError("路径里不能有 NUL 字符")
 *   - 先取 root 的真实路径（realpath），再 resolve(真实的 root, path)。不在里面：
 *     SandboxError(`路径 ${path} 在工作目录之外`)
 *   - 再检查真实路径：符号链接可能指向外面。文件还不存在时（给 write_file 用），检查离它最近的、
 *     已经存在的祖先目录的真实路径，再接上剩下的部分。不在里面：
 *     SandboxError(`路径 ${path} 通过符号链接指向了工作目录之外`)
 *   - 返回真实的绝对路径
 *
 * 第三部分：createFileTools(root, { allowWrite = false, maxFileBytes = 1_000_000 })
 *   用 @learn-ts/agent-kit/zod 的 defineTool 定义下面的工具（第 5 章），返回它们的数组。
 *   工具里的错误直接抛出就好：Toolbox 会把它变成 `工具执行失败：${message}` 交给模型。
 *   输出里的路径都是相对于工作目录的，用 "/" 分隔。
 *   - list_files { path = "." }：目录里的条目，按名字排序（用 < 比较，不用 localeCompare），目录名以 "/"
 *     结尾（符号链接不算目录），一行一个；空目录是 "（空目录）"；最多列 200 项，多出的加一行
 *     `……还有 ${n} 项没有列出`
 *   - read_file { path, startLine = 1, maxLines = 200（最大 2000） }：
 *       不是文件：SandboxError(`${相对路径} 不是文件`)；
 *       超过 maxFileBytes：SandboxError(`${相对路径} 有 ${字节数} 字节，超过了 ${maxFileBytes} 字节的上限`)；
 *       按 /\r?\n/ 分行，文件末尾的换行不算一行；空文件是 "（空文件）"；
 *       startLine 超过总行数：SandboxError(`文件只有 ${总行数} 行，startLine 是 ${startLine}`)；
 *       每行是 `${行号}: ${内容}`；没有读完整个文件时，第一行是 `（共 ${总行数} 行，显示第 ${起}-${止} 行）`
 *   - search { query, path = "." }：在 path 目录下递归查找包含 query 的行（区分大小写）
 *       path 是文件时：SandboxError(`${path} 是文件，search 的 path 应该是目录`)；
 *       跳过 node_modules 和 .git 目录；只看普通文件（不跟随符号链接），跳过超过 maxFileBytes 的文件；
 *       同一个目录里的条目按名字排序后依次处理，遇到子目录就先递归进去（深度优先）；每条结果是 `${相对路径}:${行号}: ${去掉首尾空白的行}`；
 *       没有结果是 `没有找到 "${query}"`；最多 50 条，多出时加一行 `……结果太多，只显示前 50 条`；
 *       每进入一个目录检查一次 signal（signal?.throwIfAborted()）
 *   - write_file { path, content }（只有 allowWrite 时才有）：需要时创建目录，写入，
 *       结果是 `已写入 ${相对路径}（${UTF-8 字节数} 字节）`
 *   工具的顺序：list_files、read_file、search、write_file。
 */
import type { AnyZodTool } from "@learn-ts/agent-kit/zod";
import { todo } from "../../todo.ts";

export class SandboxError extends Error {
  override name = "SandboxError";
}

export function isInside(root: string, target: string): boolean {
  return todo("实现 isInside");
}

export async function resolveInSandbox(root: string, path: string): Promise<string> {
  return todo("实现 resolveInSandbox");
}

export interface FileToolOptions {
  allowWrite?: boolean;
  maxFileBytes?: number;
}

export function createFileTools(root: string, options: FileToolOptions = {}): AnyZodTool[] {
  return todo("实现 createFileTools");
}
