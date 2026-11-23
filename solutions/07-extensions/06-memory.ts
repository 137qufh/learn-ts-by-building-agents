/**
 * 练习 7-6 参考答案：折叠旧消息，以及一次运行之外的记忆。
 * 带着 tool_calls 的 assistant 和紧跟着的 tool 消息是一整块。
 */
import type { Message } from "@learn-ts/agent-kit";

export interface CompactResult {
  messages: Message[];
  /** 被摘要替换的消息条数。没有折叠时是 0，并且不会调用 summarize。 */
  covered: number;
}

export function compactMessages(
  messages: readonly Message[],
  options: { keep: number; summarize: (dropped: readonly Message[]) => string },
): CompactResult {
  const { keep, summarize } = options;
  if (!Number.isInteger(keep) || keep < 0) {
    throw new RangeError(`keep 必须是非负整数，收到的是 ${keep}`);
  }

  const pinned: Message[] = [];
  let rest = messages;
  const first = messages[0];
  if (first?.role === "system") {
    pinned.push(first);
    rest = messages.slice(1);
  }

  const groups = groupMessages(rest);
  let keptCount = 0;
  let keptGroups = 0;
  for (let i = groups.length - 1; i >= 0; i--) {
    if (keptCount >= keep) break;
    keptCount += groups[i]?.length ?? 0;
    keptGroups++;
  }
  const dropGroups = groups.slice(0, groups.length - keptGroups);
  const keepGroups = groups.slice(groups.length - keptGroups);
  const dropped = dropGroups.flat();
  if (dropped.length === 0) {
    return { messages: [...pinned, ...keepGroups.flat()], covered: 0 };
  }

  const summary = summarize(dropped);
  const note: Message = {
    role: "user",
    content: `以下是更早对话的摘要，不是新的问题：\n${summary}`,
  };
  return { messages: [...pinned, note, ...keepGroups.flat()], covered: dropped.length };
}

function groupMessages(messages: readonly Message[]): Message[][] {
  const groups: Message[][] = [];
  let index = 0;
  while (index < messages.length) {
    const message = messages[index];
    if (message === undefined) break;
    if (
      message.role === "assistant" &&
      message.tool_calls !== undefined &&
      message.tool_calls.length > 0
    ) {
      const group: Message[] = [message];
      index++;
      while (index < messages.length && messages[index]?.role === "tool") {
        const toolMessage = messages[index];
        if (toolMessage !== undefined) group.push(toolMessage);
        index++;
      }
      groups.push(group);
      continue;
    }
    groups.push([message]);
    index++;
  }
  return groups;
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
  const items: MemoryItem[] = [];
  let nextId = 1;

  return {
    add(text, now = Date.now()) {
      if (text.trim() === "") {
        throw new Error("记忆的文本不能是空的");
      }
      const item: MemoryItem = { id: `m${nextId}`, text, createdAt: now };
      nextId++;
      items.push(item);
      return { ...item };
    },
    list() {
      return items.map((item) => ({ ...item }));
    },
    search(query, limit = 5) {
      if (!Number.isInteger(limit) || limit < 0) {
        throw new RangeError(`limit 必须是非负整数，收到的是 ${limit}`);
      }
      const queryTokens = new Set(tokensOf(query));
      if (queryTokens.size === 0 || limit === 0) return [];
      const ranked = items
        .map((item) => ({ item, score: overlap(queryTokens, item.text) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (b.item.createdAt !== a.item.createdAt) return b.item.createdAt - a.item.createdAt;
          return a.item.id < b.item.id ? -1 : 1;
        });
      return ranked.slice(0, limit).map((entry) => ({ ...entry.item }));
    },
  };
}

function overlap(queryTokens: ReadonlySet<string>, text: string): number {
  const docTokens = new Set(tokensOf(text));
  let hits = 0;
  for (const token of queryTokens) {
    if (docTokens.has(token)) hits++;
  }
  return hits;
}

/**
 * 词，再加上长度大于 2 的词的相邻二字。
 * 没有中文分词器时，"牛奶" 才能命中 "买牛奶"。二字词本身不再重复计一次。
 */
function tokensOf(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const tokens: string[] = [];
  for (const word of words) {
    tokens.push(word);
    const chars = Array.from(word);
    if (chars.length <= 2) continue;
    for (let i = 0; i < chars.length - 1; i++) {
      tokens.push(`${chars[i] ?? ""}${chars[i + 1] ?? ""}`);
    }
  }
  return tokens;
}
