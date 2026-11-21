/**
 * 练习 0-1：Hello —— 参考答案
 */

export function greet(name: string): string {
  const trimmed = name.trim();
  // 也可以写成 `if (!trimmed)`：空字符串在条件判断里会被当作 false（第 1 章讲"真值收窄"时会细说）。
  // 这里用 === "" 是因为意图更明确。
  if (trimmed === "") {
    return "Hello, stranger!";
  }
  return `Hello, ${trimmed}!`;
}
