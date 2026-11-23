/**
 * 一次运行之外还在的记忆（第 7 章）。进程内的数组，足够把接口写对；换数据库时方法不用改。
 *
 * 检索按词和二字片段重叠，不调用任何模型。空查询返回空数组：想看全部用 list()。
 */
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
export function tokensOf(text: string): string[] {
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
