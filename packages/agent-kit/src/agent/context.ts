/**
 * 估算 token、截断工具输出、把聊天记录放进上下文预算（来自练习 6-4）
 */
import type { Message } from "../client.ts";

const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export function estimateTokens(text: string): number {
  let wide = 0;
  let other = 0;
  for (const char of text) {
    if (WIDE.test(char)) {
      wide++;
    } else {
      other++;
    }
  }
  return wide + Math.ceil(other / 4);
}

export const MESSAGE_OVERHEAD = 4;

export function messageTokens(message: Message): number {
  let tokens = MESSAGE_OVERHEAD + estimateTokens(message.content ?? "");
  if (message.role === "assistant") {
    for (const call of message.tool_calls ?? []) {
      tokens +=
        MESSAGE_OVERHEAD +
        estimateTokens(call.function.name) +
        estimateTokens(call.function.arguments);
    }
  }
  return tokens;
}

export function truncateMiddle(text: string, maxChars: number): string {
  const chars = Array.from(text);
  if (chars.length <= maxChars) {
    return text;
  }
  const head = Math.ceil(maxChars / 2);
  const tail = maxChars - head;
  const omitted = chars.length - maxChars;
  return (
    chars.slice(0, head).join("") +
    `\n…（中间省略了 ${omitted} 个字符）…\n` +
    (tail === 0 ? "" : chars.slice(-tail).join(""))
  );
}

export function groupTurns(messages: readonly Message[]): Message[][] {
  const groups: Message[][] = [];
  for (const message of messages) {
    const last = groups.at(-1);
    if (message.role === "tool" && last !== undefined) {
      last.push(message);
    } else {
      groups.push([message]);
    }
  }
  return groups;
}

export function omittedNote(count: number): Message {
  return { role: "system", content: `（为了控制上下文长度，更早的 ${count} 条消息已经省略）` };
}

export interface FitResult {
  messages: Message[];
  dropped: number;
  tokens: number;
}

export function fitToBudget(
  messages: readonly Message[],
  maxTokens: number,
  count: (message: Message) => number = messageTokens,
): FitResult {
  let pinnedLength = 0;
  while (messages[pinnedLength]?.role === "system") {
    pinnedLength++;
  }
  const pinned = messages.slice(0, pinnedLength);
  const groups = groupTurns(messages.slice(pinnedLength));
  const sum = (list: readonly Message[]): number =>
    list.reduce((total, message) => total + count(message), 0);

  const pinnedTokens = sum(pinned);
  const groupTokens = groups.map(sum);
  let rest = groupTokens.reduce((a, b) => a + b, 0);
  if (pinnedTokens + rest <= maxTokens) {
    return { messages: [...messages], dropped: 0, tokens: pinnedTokens + rest };
  }

  let first = 0;
  let dropped = 0;
  // 至少保留最后一组：没有最近的消息，模型就不知道现在要做什么
  while (first < groups.length - 1) {
    rest -= groupTokens[first]!;
    dropped += groups[first]!.length;
    first++;
    if (pinnedTokens + count(omittedNote(dropped)) + rest <= maxTokens) {
      break;
    }
  }
  if (dropped === 0) {
    return { messages: [...messages], dropped: 0, tokens: pinnedTokens + rest }; // 只有一组，没法再省了
  }
  const note = omittedNote(dropped);
  return {
    messages: [...pinned, note, ...groups.slice(first).flat()],
    dropped,
    tokens: pinnedTokens + count(note) + rest,
  };
}
