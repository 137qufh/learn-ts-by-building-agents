/**
 * 练习 7-6：短期记忆怎么折叠，长期记忆记在哪里
 *
 * 课程：chapters/07-extensions/06-memory.md
 * 运行：pnpm ex 06-memory
 *
 * compactMessages(messages, { keep, summarize })：
 * - 不修改传入的数组。keep 不是非负整数时抛 RangeError。
 * - 第一条如果是 system，永远保留，不计入 keep，也不交给 summarize。
 * - 其余消息按块分组。一条带非空 tool_calls 的 assistant 和紧跟着的 tool 消息是一块。
 * - 从末尾留下若干块，直到留下的消息条数 >= keep。宁可多留一整块，也不要拆开工具调用。
 * - 没有可折叠的消息时 covered 是 0，不调用 summarize。
 * - 否则 summarize 收到被折叠的消息（按原来的顺序）。结果在 system 之后、保留的消息之前
 *   插入一条 user：`以下是更早对话的摘要，不是新的问题：\n${摘要}`。covered 是被折叠的条数。
 *
 * createMemoryStore()：
 * - add 把文本存进去，id 是 m1、m2……createdAt 默认 Date.now()，也可以传入 now。
 *   文本 trim 之后是空的就抛 Error。返回的对象是副本。
 * - list 按插入顺序返回副本。改返回值不影响下一次 list。
 * - search 用词和二字片段算重叠（"牛奶" 能命中 "买牛奶"，不区分大小写）。
 *   重叠数是分数。0 分的不返回。分数高的在前；分数相同，createdAt 新的在前；还相同就 id 字典序。
 *   空查询返回 []。limit 默认 5；0 返回 []；负数或不是整数抛 RangeError。
 */
import type { Message } from "@learn-ts/agent-kit";
import { todo } from "../todo.ts";

export interface CompactResult {
  messages: Message[];
  covered: number;
}

export function compactMessages(
  messages: readonly Message[],
  options: { keep: number; summarize: (dropped: readonly Message[]) => string },
): CompactResult {
  return todo("实现 compactMessages");
}

export interface MemoryItem {
  id: string;
  text: string;
  createdAt: number;
}

export interface MemoryStore {
  add(text: string, now?: number): MemoryItem;
  list(): readonly MemoryItem[];
  search(query: string, limit?: number): MemoryItem[];
}

export function createMemoryStore(): MemoryStore {
  return todo("实现 createMemoryStore");
}
