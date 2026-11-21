/**
 * 第 0 章项目：Echo Agent —— 参考答案
 */

/** /help 命令返回的帮助文本。 */
export const HELP_TEXT = [
  "可用命令：",
  "  /help            显示这条帮助",
  "  /upper <文本>    把文本转成大写",
  "  /reverse <文本>  把文本倒过来",
  "  /count <文本>    统计文本有多少个词",
  "  /exit            退出",
].join("\n");

/** 根据用户输入生成回复。 */
export function reply(input: string): string {
  const text = input.trim();

  if (text === "") {
    return "（你什么都没说）";
  }
  if (!text.startsWith("/")) {
    return `你说：${text}`;
  }

  // 把 "/upper   hi there" 拆成命令名 "/upper" 和参数 "hi there"。
  // 正则 /^(\S+)\s*(.*)$/s 的意思：开头一段非空白字符（命令名），然后任意空白，然后剩下的全部（参数）。
  // 末尾的 s 标志让 . 也能匹配换行，这样多行参数不会被截断。
  const match = /^(\S+)\s*(.*)$/s.exec(text);
  // text 非空且以 / 开头，正则一定能匹配。但 TypeScript 不知道这一点：exec 的返回类型是
  // RegExpExecArray | null，而且开启 noUncheckedIndexedAccess 后，match[1] 的类型是 string | undefined。
  // 这里用 ?? 给出默认值（第 1 章会讲），既让类型检查通过，又不会在意外情况下崩溃。
  const command = match?.[1] ?? text;
  const arg = (match?.[2] ?? "").trim();

  switch (command) {
    case "/help":
      return HELP_TEXT;
    case "/upper":
      return arg === "" ? usage(command) : arg.toUpperCase();
    case "/reverse":
      // [...arg] 按 Unicode 码点拆分；直接 arg.split("") 会把某些 emoji 拆坏。
      return arg === "" ? usage(command) : [...arg].reverse().join("");
    case "/count":
      return arg === "" ? usage(command) : `${arg.split(/\s+/).length} 个词`;
    default:
      return `未知命令：${command}。输入 /help 查看可用命令。`;
  }
}

function usage(command: string): string {
  return `用法：${command} <文本>`;
}

/** 输入（去掉首尾空白后）是 "/exit" 或 "/quit" 时返回 true。 */
export function shouldExit(input: string): boolean {
  const text = input.trim();
  return text === "/exit" || text === "/quit";
}
