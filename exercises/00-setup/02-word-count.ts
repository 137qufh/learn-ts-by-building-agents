/**
 * 练习 0-2：用调试器修 bug
 *
 * 课程：chapters/00-setup/04-debugging.md
 * 运行：pnpm ex 02-word-count
 *
 * 下面两个函数已经写好了，但都有 bug，测试会失败。
 * 请用调试器（而不是只靠读代码）找出原因并修好它们。
 *
 * 规则：一个"词"是一段连续的非空白字符。空格、制表符、换行都算空白。
 */

/** 统计文本里有多少个词。 */
export function countWords(text: string): number {
  const words = text.split(" ");
  return words.length;
}

/** 计算一组消息平均每条有多少个词。没有消息时返回 0。 */
export function averageWords(messages: readonly string[]): number {
  let total = 0;
  for (const message of messages) {
    total += countWords(message);
  }
  return total / messages.length;
}
