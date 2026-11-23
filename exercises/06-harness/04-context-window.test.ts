import type { Message } from "@learn-ts/agent-kit";
import { describe, expect, test } from "vitest";
import {
  MESSAGE_OVERHEAD,
  estimateTokens,
  fitToBudget,
  groupTurns,
  messageTokens,
  omittedNote,
  truncateMiddle,
} from "./04-context-window.ts";

describe("estimateTokens", () => {
  test("其他字符大约 4 个一个 token，向上取整", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  test("汉字、假名、韩文每个算一个 token", () => {
    expect(estimateTokens("你好世界")).toBe(4);
    expect(estimateTokens("こんにちは")).toBe(5);
    expect(estimateTokens("안녕")).toBe(2);
    expect(estimateTokens("用 TypeScript 写")).toBe(2 + Math.ceil(12 / 4));
  });

  test("按字符数，不按 UTF-16 单元：一个 emoji 是一个字符", () => {
    expect(estimateTokens("🙂🙂🙂🙂")).toBe(1);
  });
});

describe("messageTokens", () => {
  test("每条消息固定开销 + 内容", () => {
    expect(MESSAGE_OVERHEAD).toBe(4);
    expect(messageTokens({ role: "user", content: "你好" })).toBe(4 + 2);
    expect(messageTokens({ role: "assistant", content: null })).toBe(4);
    expect(messageTokens({ role: "tool", tool_call_id: "c1", content: "abcd" })).toBe(5);
  });

  test("工具调用：每个调用的开销 + 名字 + 参数", () => {
    const message: Message = {
      role: "assistant",
      content: "查",
      tool_calls: [
        { id: "c1", type: "function", function: { name: "read", arguments: '{"p":1}' } },
      ],
    };
    expect(messageTokens(message)).toBe(4 + 1 + 4 + 1 + 2);
  });
});

describe("truncateMiddle", () => {
  test("不超过上限时原样返回", () => {
    expect(truncateMiddle("abc", 3)).toBe("abc");
  });

  test("保留开头和结尾（开头多一个），中间换成说明", () => {
    expect(truncateMiddle("0123456789", 5)).toBe("012\n…（中间省略了 5 个字符）…\n89");
    expect(truncateMiddle("0123456789", 1)).toBe("0\n…（中间省略了 9 个字符）…\n");
  });

  test("按字符截断，不会切开 emoji", () => {
    expect(truncateMiddle("🙂🙂🙂🙂", 2)).toBe("🙂\n…（中间省略了 2 个字符）…\n🙂");
  });
});

const user = (content: string): Message => ({ role: "user", content });
const reply = (content: string): Message => ({ role: "assistant", content });
const toolCall = (id: string): Message => ({
  role: "assistant",
  content: null,
  tool_calls: [{ id, type: "function", function: { name: "t", arguments: "{}" } }],
});
const result = (id: string, content = "ok"): Message => ({
  role: "tool",
  tool_call_id: id,
  content,
});

describe("groupTurns", () => {
  test("tool 消息和它前面的消息分在一组，其他消息各自一组", () => {
    const messages = [user("a"), toolCall("c1"), result("c1"), reply("b"), user("c")];
    expect(groupTurns(messages)).toEqual([
      [user("a")],
      [toolCall("c1"), result("c1")],
      [reply("b")],
      [user("c")],
    ]);
  });

  test("开头就是 tool 消息时，它自己一组", () => {
    expect(groupTurns([result("x"), user("a")])).toEqual([[result("x")], [user("a")]]);
  });
});

describe("fitToBudget", () => {
  /** 每条消息算 10 个 token，方便计算 */
  const ten = (): number => 10;
  const system: Message = { role: "system", content: "你是助手" };

  test("放得下：原样返回（新数组）", () => {
    const messages = [system, user("a"), reply("b")];
    const fitted = fitToBudget(messages, 30, ten);
    expect(fitted).toEqual({ messages, dropped: 0, tokens: 30 });
    expect(fitted.messages).not.toBe(messages);
  });

  test("放不下：保留开头的 system 消息，从最早的组开始省略，并插入一条说明", () => {
    const messages = [system, user("1"), reply("2"), user("3"), reply("4")];
    const fitted = fitToBudget(messages, 40, ten);
    expect(fitted.messages).toEqual([system, omittedNote(2), user("3"), reply("4")]);
    expect(fitted.dropped).toBe(2);
    expect(fitted.tokens).toBe(40); // 说明本身也占预算
    expect(omittedNote(2)).toEqual({
      role: "system",
      content: "（为了控制上下文长度，更早的 2 条消息已经省略）",
    });
  });

  test("工具调用和它的结果一起省略，不会只剩下其中一半", () => {
    const messages = [user("1"), toolCall("c1"), result("c1"), result("c1b"), reply("2")];
    // 说明只算 1 个 token，其他消息 10 个
    const cheapNote = (message: Message): number => (message.role === "system" ? 1 : 10);
    const fitted = fitToBudget(messages, 25, cheapNote);
    expect(fitted.messages).toEqual([omittedNote(4), reply("2")]);
    const fitted2 = fitToBudget(messages, 45, cheapNote);
    expect(fitted2.messages).toEqual([
      omittedNote(1),
      toolCall("c1"),
      result("c1"),
      result("c1b"),
      reply("2"),
    ]);
  });

  test("最后一组总是保留，哪怕超出预算", () => {
    const messages = [system, user("1"), toolCall("c1"), result("c1")];
    const fitted = fitToBudget(messages, 5, ten);
    expect(fitted.messages).toEqual([system, omittedNote(1), toolCall("c1"), result("c1")]);
    expect(fitted.tokens).toBe(40);
  });

  test("只有一组时没什么可省的：原样返回", () => {
    const messages = [system, user("很长很长")];
    expect(fitToBudget(messages, 5, ten)).toEqual({ messages, dropped: 0, tokens: 20 });
  });

  test("默认用 messageTokens 计数", () => {
    const messages = [user("你好"), reply("好")];
    expect(fitToBudget(messages, 100).tokens).toBe(
      messageTokens(user("你好")) + messageTokens(reply("好")),
    );
  });

  test("不修改传入的数组", () => {
    const messages = [user("1"), reply("2"), user("3")];
    fitToBudget(messages, 10, ten);
    expect(messages).toHaveLength(3);
  });
});
