/**
 * 练习 6-4：上下文窗口与 token 预算
 *
 * 课程：chapters/06-harness/04-context-window.md
 * 运行：pnpm ex 04-context-window
 *
 * 聊天记录只增不减，模型的上下文窗口却是有限的。这道题实现 harness 控制上下文长度的几个零件。
 *
 * 第一部分：估算 token
 *   estimateTokens(text)：汉字、日文假名、韩文每个字符算 1 个 token，其他字符每 4 个算 1 个（向上取整）。
 *     按字符（码点）遍历，不按 UTF-16 单元。提示：for...of 遍历字符串；Unicode 属性转义
 *     /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
 *   messageTokens(message)：MESSAGE_OVERHEAD + content 的 token（content 是 null 时算 ""）；
 *     assistant 消息的每个工具调用再加 MESSAGE_OVERHEAD + 名字的 token + 参数的 token
 *
 * 第二部分：truncateMiddle(text, maxChars)
 *   字符数（码点）不超过 maxChars 时原样返回。否则保留开头 ceil(maxChars / 2) 个字符和结尾剩下的字符，
 *   中间换成 `\n…（中间省略了 ${省略的字符数} 个字符）…\n`。工具的输出常常是开头和结尾最有用（报错信息在最后）。
 *
 * 第三部分：groupTurns(messages)
 *   把消息分成"不能拆开"的组：tool 消息和它前面的消息（发起调用的 assistant 消息）在同一组，
 *   其他每条消息各自开始一个新组。开头就是 tool 消息时，它自己开始一组。
 *
 * 第四部分：fitToBudget(messages, maxTokens, count = messageTokens)
 *   - 开头连续的 system 消息总是保留
 *   - 其余的消息用 groupTurns 分组；总数不超过 maxTokens 时，原样返回（新数组），dropped 是 0
 *   - 否则从最早的组开始整组省略，在 system 消息之后插入一条 omittedNote(省略的消息条数)；
 *     说明本身也算进预算。省略到总数不超过 maxTokens 为止，但 **最后一组总是保留**（哪怕仍然超出）
 *   - 只有一组可以省略时没什么可省的：原样返回，dropped 是 0
 *   - tokens 是返回的消息的总数（用 count 计算）；不修改传入的数组
 */
import type { Message } from "@learn-ts/agent-kit";
import { todo } from "../todo.ts";

export function estimateTokens(text: string): number {
  return todo("实现 estimateTokens");
}

/** 每条消息（和每个工具调用）的固定开销：角色、分隔符等 */
export const MESSAGE_OVERHEAD = 4;

export function messageTokens(message: Message): number {
  return todo("实现 messageTokens");
}

export function truncateMiddle(text: string, maxChars: number): string {
  return todo("实现 truncateMiddle");
}

export function groupTurns(messages: readonly Message[]): Message[][] {
  return todo("实现 groupTurns");
}

export function omittedNote(count: number): Message {
  return { role: "system", content: `（为了控制上下文长度，更早的 ${count} 条消息已经省略）` };
}

export interface FitResult {
  messages: Message[];
  /** 省略了几条消息 */
  dropped: number;
  tokens: number;
}

export function fitToBudget(
  messages: readonly Message[],
  maxTokens: number,
  count: (message: Message) => number = messageTokens,
): FitResult {
  return todo("实现 fitToBudget");
}
