import { describe, expect, test } from "vitest";
import { averageWords, countWords } from "./02-word-count.ts";

describe("countWords", () => {
  test("用单个空格分隔的词", () => {
    expect(countWords("hello agent world")).toBe(3);
  });

  test("连续的多个空格只算一个分隔", () => {
    expect(countWords("hello   agent")).toBe(2);
  });

  test("换行和制表符也是分隔", () => {
    expect(countWords("hello\nagent\tworld")).toBe(3);
  });

  test("忽略开头和结尾的空白", () => {
    expect(countWords("  hello agent \n")).toBe(2);
  });

  test("空字符串有 0 个词", () => {
    expect(countWords("")).toBe(0);
  });

  test("只有空白的字符串有 0 个词", () => {
    expect(countWords(" \n\t ")).toBe(0);
  });
});

describe("averageWords", () => {
  test("计算平均每条消息的词数", () => {
    expect(averageWords(["one", "one two three"])).toBe(2);
  });

  test("空消息算 0 个词，但仍计入条数", () => {
    expect(averageWords(["one two", ""])).toBe(1);
  });

  test("没有消息时返回 0", () => {
    expect(averageWords([])).toBe(0);
  });
});
