/**
 * 练习 4-4：声明文件
 *
 * 课程：chapters/04-tooling/04-declaration-files.md
 * 运行：pnpm ex 04-colors
 *
 * 第一部分在 vendor/ansi-lite.d.ts：给没有类型的 vendor/ansi-lite.js 写声明。
 * 先完成它，这个文件里的代码才能通过类型检查。
 *
 * 第二部分在这里：用 ansi-lite 实现 harness 在终端里显示工具状态的函数。
 */
import { isEnabled, setEnabled, style } from "./vendor/ansi-lite.js";

export type ToolStatus = "running" | "ok" | "error";

/**
 * 一行工具状态：
 * - running：`${灰色的 "…"} ${tool}`
 * - ok：`${绿色的 "✓"} ${tool}`，有 detail 时再加上 ` ${暗淡（dim）的 detail}`
 * - error：`${红色的 "✗"} ${加粗的 tool}`，有 detail 时再加上 `: ${红色的 detail}`
 *
 * running 状态忽略 detail。
 */
export function statusLine(tool: string, status: ToolStatus, detail?: string): string {
  switch (status) {
    case "running":
      return `${style("…", "gray")} ${tool}`;
    case "ok":
      return `${style("✓", "green")} ${tool}${detail === undefined ? "" : ` ${style(detail, "dim")}`}`;
    case "error":
      return `${style("✗", "red")} ${style(tool, "bold")}${detail === undefined ? "" : `: ${style(detail, "red")}`}`;
  }
}

/**
 * 在 fn 执行期间临时打开或关闭颜色，结束后恢复原来的设置（fn 抛错也要恢复），返回 fn 的结果。
 */
export function withColor<T>(enabled: boolean, fn: () => T): T {
  const previous = isEnabled();
  setEnabled(enabled);
  try {
    return fn();
  } finally {
    setEnabled(previous);
  }
}
