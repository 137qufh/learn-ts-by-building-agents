/**
 * 练习 0-2：用调试器修 bug —— 参考答案
 *
 * Bug 1（countWords）：
 *   "hello   agent".split(" ") 得到的是 ["hello", "", "", "agent"]：
 *   每两个相邻的空格之间都会切出一个空字符串。同理，"".split(" ") 是 [""]，长度为 1。
 *   而且 split(" ") 只认空格，不认换行和制表符。
 *   在调试器里给 `words` 打个断点，这些一眼就能看到。
 *
 * Bug 2（averageWords）：
 *   messages 为空时，0 / 0 在 JavaScript 里是 NaN（Not a Number），不会报错。
 *   调试时可以看到 total 是 0、messages.length 也是 0。
 */

/** 统计文本里有多少个词。 */
export function countWords(text: string): number {
  // \s+ 匹配一段连续的空白（空格、换行、制表符等）。
  // 先 trim() 去掉首尾空白，否则开头的空白会切出一个空字符串。
  const trimmed = text.trim();
  if (trimmed === "") {
    return 0; // "".split(...) 会得到 [""]，所以空字符串要单独处理
  }
  return trimmed.split(/\s+/).length;
}

/** 计算一组消息平均每条有多少个词。没有消息时返回 0。 */
export function averageWords(messages: readonly string[]): number {
  if (messages.length === 0) {
    return 0;
  }
  let total = 0;
  for (const message of messages) {
    total += countWords(message);
  }
  return total / messages.length;
}
