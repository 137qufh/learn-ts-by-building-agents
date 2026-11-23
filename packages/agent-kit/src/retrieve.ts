/**
 * 不联网的检索：关键词重叠，加上一个确定性的本地向量（第 7 章）。
 *
 * 真正的 embedding 模型不在这门课的离线路径里。Embedder 是一个接口，
 * 测试可以注入假的，设置环境变量的程序可以换成真正的模型。默认实现用哈希技巧，
 * 同样的文本永远得到同样的向量。
 */
import { tokensOf } from "./memory.ts";

export interface Embedder {
  embed(text: string): readonly number[];
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`向量长度不同：${a.length} 和 ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function createLocalEmbedder(dimensions = 32): Embedder {
  if (!Number.isInteger(dimensions) || dimensions < 1) {
    throw new RangeError(`dimensions 必须是正整数，收到的是 ${dimensions}`);
  }
  return {
    embed(text) {
      const vector = Array.from({ length: dimensions }, () => 0);
      for (const token of tokensOf(text)) {
        const hash = fnv1a(token);
        const index = hash % dimensions;
        const sign = (hash & 1) === 0 ? 1 : -1;
        vector[index] = (vector[index] ?? 0) + sign;
      }
      return normalize(vector);
    },
  };
}

export interface Retrieved {
  id: string;
  text: string;
  score: number;
}

export interface Retriever {
  add(text: string, id?: string): { id: string; text: string };
  search(query: string, limit?: number): Retrieved[];
}

export interface RetrieverOptions {
  embedder?: Embedder;
  dimensions?: number;
}

export function createRetriever(options: RetrieverOptions = {}): Retriever {
  const embedder = options.embedder ?? createLocalEmbedder(options.dimensions ?? 32);
  const docs: { id: string; text: string; vector: readonly number[] }[] = [];
  const ids = new Set<string>();
  let nextId = 1;

  return {
    add(text, id) {
      if (text.trim() === "") throw new Error("文本不能是空的");
      const docId = id ?? `m${nextId}`;
      if (id === undefined) nextId++;
      if (ids.has(docId)) throw new Error(`id "${docId}" 已经存在`);
      ids.add(docId);
      docs.push({ id: docId, text, vector: embedder.embed(text) });
      return { id: docId, text };
    },
    search(query, limit = 5) {
      if (!Number.isInteger(limit) || limit < 0) {
        throw new RangeError(`limit 必须是非负整数，收到的是 ${limit}`);
      }
      if (limit === 0) return [];
      const queryVector = embedder.embed(query);
      const queryTokens = new Set(tokensOf(query));
      const ranked = docs.map((doc) => {
        const keyword = keywordScore(queryTokens, doc.text);
        const vector = (cosine(queryVector, doc.vector) + 1) / 2;
        return { id: doc.id, text: doc.text, score: 0.5 * keyword + 0.5 * vector };
      });
      ranked.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      return ranked.slice(0, limit);
    },
  };
}

function keywordScore(queryTokens: ReadonlySet<string>, text: string): number {
  if (queryTokens.size === 0) return 0;
  const docTokens = new Set(tokensOf(text));
  let hits = 0;
  for (const token of queryTokens) {
    if (docTokens.has(token)) hits++;
  }
  return hits / queryTokens.size;
}

function normalize(vector: number[]): number[] {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

/** FNV-1a，32 位。只为了稳定地把 token 散到桶里，不是加密。 */
function fnv1a(token: string): number {
  let hash = 2166136261;
  for (const char of token) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    hash ^= code;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
