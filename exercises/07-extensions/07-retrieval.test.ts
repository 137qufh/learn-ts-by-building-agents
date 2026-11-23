import { describe, expect, test } from "vitest";
import { cosine, createLocalEmbedder, createRetriever } from "./07-retrieval.ts";

describe("cosine 和本地向量", () => {
  test("同向、正交、反向和零向量", () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([1, 0], [-1, 0])).toBe(-1);
    expect(cosine([0, 0], [1, 0])).toBe(0);
    expect(() => cosine([1], [1, 0])).toThrow(Error);
  });

  test("同样的文本得到同样的单位向量；牛奶和买牛奶比和量子更近", () => {
    const embed = createLocalEmbedder(8);
    expect(embed.embed("")).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(embed.embed("牛奶").map((value) => Number(value.toFixed(6)))).toEqual([
      0, 0, 0, 0, 1, 0, 0, 0,
    ]);
    expect(embed.embed("Cat")).toEqual(embed.embed("cat"));
    const milk = embed.embed("牛奶");
    expect(cosine(milk, embed.embed("买牛奶"))).toBeGreaterThan(0.8);
    expect(cosine(milk, embed.embed("量子"))).toBe(0);
    expect(() => createLocalEmbedder(0)).toThrow(RangeError);
  });
});

describe("createRetriever", () => {
  test("关键词和向量一起排序；注入的 embedder 真的被用到", () => {
    const retriever = createRetriever({
      embedder: {
        embed: (text) =>
          text.includes("alpha") ? [1, 0] : text.includes("beta") ? [0, 1] : [0, 0],
      },
    });
    retriever.add("alpha story", "a");
    retriever.add("beta note", "b");
    const found = retriever.search("alpha", 2);
    expect(found.map((item) => item.id)).toEqual(["a", "b"]);
    expect(found[0]?.score).toBeCloseTo(1);
    expect(found[1]?.score).toBeCloseTo(0.25);
  });

  test("默认向量能把买牛奶排在量子前面；重复 id 和空文本", () => {
    const retriever = createRetriever({ dimensions: 8 });
    retriever.add("买牛奶");
    retriever.add("量子");
    expect(retriever.search("牛奶", 2).map((item) => item.text)).toEqual(["买牛奶", "量子"]);
    expect(() => retriever.add("买牛奶", "m1")).toThrow(/m1/);
    expect(() => retriever.add("   ")).toThrow(Error);
    expect(retriever.search("牛奶", 0)).toEqual([]);
    expect(() => retriever.search("牛奶", -1)).toThrow(RangeError);
  });
});
