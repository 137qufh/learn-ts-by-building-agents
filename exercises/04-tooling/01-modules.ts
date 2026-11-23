/**
 * 练习 4-1：模块格式与插件加载
 *
 * 课程：chapters/04-tooling/01-modules.md
 * 运行：pnpm ex 01-modules
 */
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { todo } from "../todo.ts";

// ── 第一部分：Node 把一个文件当成哪种模块 ────────────────────────────

export type PackageType = "module" | "commonjs" | undefined;

/**
 * Node.js 加载这个文件的结果：
 * - "esm"：按 ES 模块执行
 * - "cjs"：按 CommonJS 执行
 * - "syntax-error"：格式已经确定是 CommonJS，但文件里用了 ESM 独有的语法，直接报 SyntaxError
 */
export type LoadOutcome = "esm" | "cjs" | "syntax-error";

/**
 * 按课程里的那张表，判断 Node 加载 fileName 的结果。
 *
 * @param fileName 文件名，比如 "index.ts"、"config.cjs"
 * @param packageType 离文件最近的 package.json 里的 "type"，没写就是 undefined
 * @param usesEsmSyntax 文件里是否用了 ESM 独有的语法（import/export 语句、import.meta、顶层 await）
 *
 * 只需要考虑 .js .ts .mjs .mts .cjs .cts 六种扩展名，其他扩展名抛出 Error，消息里包含"扩展名"。
 */
export function moduleFormat(
  fileName: string,
  packageType: PackageType,
  usesEsmSyntax: boolean,
): LoadOutcome {
  return todo("实现 moduleFormat");
}

// ── 第二部分：从目录里加载插件工具 ──────────────────────────────────

export interface PluginTool {
  name: string;
  description: string;
  run: (input: string) => string | Promise<string>;
}

export interface LoadResult {
  /** 成功加载的工具，按文件名排序 */
  tools: PluginTool[];
  /** 每个出问题的文件一条，格式见 loadTools 的说明，按文件名排序 */
  errors: string[];
}

/**
 * 判断一个文件名是不是插件：
 * - 扩展名是 .js .mjs .ts .mts 之一
 * - 不是声明文件（.d.ts、.d.mts、.d.cts）
 * - 不以 "_" 或 "." 开头（约定用来放辅助文件和隐藏文件）
 */
export function isPluginFile(fileName: string): boolean {
  return todo("实现 isPluginFile");
}

/**
 * 加载 dir 目录（不含子目录）里的每个插件文件，取它的默认导出作为工具。
 *
 * - 只看 isPluginFile 认可的文件，按文件名排序
 * - 用动态 import() 加载。注意 import() 要的是 URL：先用 pathToFileURL 把绝对路径转成 file:// URL
 * - 每个出问题的文件在 errors 里记一条，然后继续处理下一个文件（一个坏插件不能拖垮全部）：
 *   - 加载时抛错：`${文件名}: 加载失败：${错误的 message}`
 *   - 没有默认导出：`${文件名}: 没有默认导出`
 *   - 默认导出不是工具（name 是非空字符串、description 是字符串、run 是函数）：
 *     `${文件名}: 默认导出不是合法的工具`
 *   - 工具名和前面某个文件的重复：`${文件名}: 工具名 "${name}" 已经被 ${先占用的文件名} 使用`
 *     （按文件名顺序，先到先得）
 * - 目录本身读不了（比如不存在）：这不是某个插件的问题，让 readdir 的错误原样传出去（Promise 被拒绝）
 */
export async function loadTools(dir: string): Promise<LoadResult> {
  return todo("实现 loadTools");
}
