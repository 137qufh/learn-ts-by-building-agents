/**
 * 练习 7-7：不联网的检索
 *
 * 课程：chapters/07-extensions/07-retrieval.md
 * 运行：pnpm ex 07-retrieval
 *
 * cosine(a, b)：点积除以两个长度。长度不同抛 Error。任一向量全是 0 时返回 0。
 *
 * createLocalEmbedder(dimensions = 32)：dimensions 不是正整数抛 RangeError。
 * embed 把文本分成词和二字片段（和 7-6 的检索同一个规则，不区分大小写），
 * 每个片段用 FNV-1a 散到一个桶里，最低位决定加 1 还是减 1，然后做 L2 归一化。
 * 空文本得到全 0。同样的文本永远得到同样的向量。
 *
 * createRetriever({ embedder, dimensions }?)：
 * 不传 embedder 就用 createLocalEmbedder(dimensions ?? 32)。
 * add(text, id?)：空文本抛 Error。id 省略时用 m1、m2……重复的 id 抛 Error。
 * search(query, limit = 5)：分数 = 0.5 * 关键词重叠比例 + 0.5 * (cosine + 1) / 2。
 * 关键词重叠比例是查询片段里有多少出现在文档里，查询没有片段时这一项是 0。
 * 按分数从高到低，分数相同按 id 字典序。limit 不是非负整数抛 RangeError，0 返回 []。
 * 没有匹配也要返回文档（向量项给了每条一个底分），只是排在后面、受 limit 限制。
 */
import { todo } from "../todo.ts";

export interface Embedder {
  embed(text: string): readonly number[];
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  return todo("实现 cosine");
}

export function createLocalEmbedder(dimensions?: number): Embedder {
  return todo("实现 createLocalEmbedder");
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

export function createRetriever(options?: RetrieverOptions): Retriever {
  return todo("实现 createRetriever");
}
