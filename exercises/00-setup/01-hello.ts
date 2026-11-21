/**
 * 练习 0-1：Hello
 *
 * 课程：chapters/00-setup/01-node-and-pnpm.md
 * 运行：pnpm ex 01-hello
 *
 * 实现 greet(name)：
 * - 返回 `Hello, <name>!`
 * - name 前后的空白要去掉："  Ada " → "Hello, Ada!"
 * - name 为空，或者只有空白时，返回 "Hello, stranger!"
 *
 * 提示：字符串的 .trim() 方法会返回去掉前后空白的新字符串。
 */
import { todo } from "../todo.ts";

export function greet(name: string): string {
  return todo("实现 greet");
}
