// 7.7 本地向量：同样的文本，同样的方向
// 运行：node chapters/07-extensions/examples/07-retrieval.ts
//
// 预期输出：
// same true
// closer true
// orthogonal true

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

function embed(text: string, dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const tokens: string[] = [];
  for (const word of words) {
    tokens.push(word);
    const chars = Array.from(word);
    if (chars.length <= 2) continue;
    for (let i = 0; i < chars.length - 1; i++)
      tokens.push(`${chars[i] ?? ""}${chars[i + 1] ?? ""}`);
  }
  for (const token of tokens) {
    const hash = fnv1a(token);
    const index = hash % dimensions;
    vector[index] = (vector[index] ?? 0) + ((hash & 1) === 0 ? 1 : -1);
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let left = 0;
  let right = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    left += (a[i] ?? 0) ** 2;
    right += (b[i] ?? 0) ** 2;
  }
  if (left === 0 || right === 0) return 0;
  return dot / (Math.sqrt(left) * Math.sqrt(right));
}

const milk = embed("牛奶", 8);
console.log("same", cosine(milk, embed("牛奶", 8)) === 1);
console.log("closer", cosine(milk, embed("牛奶盒", 8)) > cosine(milk, embed("量子", 8)));
console.log("orthogonal", cosine(embed("aaa", 8), embed("", 8)) === 0);
