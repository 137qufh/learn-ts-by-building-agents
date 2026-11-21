/**
 * 第 0 章项目：Echo Agent
 *
 * 课程：chapters/00-setup/05-project-echo-agent.md
 * 测试：pnpm ex echo-agent
 * 试玩：pnpm tsx chapters/00-setup/project/cli.ts
 *
 * 实现两个函数，规则见下方注释和测试文件。
 */
import { todo } from "../../todo.ts";

/** /help 命令返回的帮助文本。 */
export const HELP_TEXT = [
  "可用命令：",
  "  /help            显示这条帮助",
  "  /upper <文本>    把文本转成大写",
  "  /reverse <文本>  把文本倒过来",
  "  /count <文本>    统计文本有多少个词",
  "  /exit            退出",
].join("\n");

/**
 * 根据用户输入生成回复。输入先去掉首尾空白，然后：
 *
 * | 输入                 | 回复                                          |
 * | -------------------- | --------------------------------------------- |
 * | 空                   | "（你什么都没说）"                            |
 * | "/help"              | HELP_TEXT                                     |
 * | "/upper hello"       | "HELLO"                                       |
 * | "/reverse abc"       | "cba"                                         |
 * | "/count a b  c"      | "3 个词"                                      |
 * | 其他以 / 开头的输入  | "未知命令：/xxx。输入 /help 查看可用命令。"   |
 * | 普通文本 "hi"        | "你说：hi"                                    |
 *
 * 细节：
 * - 命令名和参数之间用空白分隔，参数本身也要去掉首尾空白
 * - 命令后没有参数时（例如只输入 "/upper"），回复 "用法：/upper <文本>"
 *   （其他需要参数的命令同理）
 * - 未知命令的回复里只包含命令名本身，不包含参数
 */
export function reply(input: string): string {
  return todo("实现 reply");
}

/** 输入（去掉首尾空白后）是 "/exit" 或 "/quit" 时返回 true。 */
export function shouldExit(input: string): boolean {
  return todo("实现 shouldExit");
}
