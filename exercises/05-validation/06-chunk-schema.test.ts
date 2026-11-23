import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  ChatChunkSchema,
  ChoiceSchema,
  FinishReasonSchema,
  ToolCallDeltaSchema,
  UsageSchema,
  parseChunk,
} from "./06-chunk-schema.ts";

function chunk(value: unknown) {
  return parseChunk(JSON.stringify(value));
}

describe("FinishReasonSchema", () => {
  test("认识的值原样保留", () => {
    for (const reason of ["stop", "length", "tool_calls", "content_filter"]) {
      expect(FinishReasonSchema.parse(reason)).toBe(reason);
    }
  });

  test("不认识的字符串变成 other", () => {
    expect(FinishReasonSchema.parse("insufficient_system_resource")).toBe("other");
    expect(FinishReasonSchema.parse("")).toBe("other");
  });

  test("不是字符串时报错", () => {
    expect(FinishReasonSchema.safeParse("stop").success).toBe(true);
    expect(FinishReasonSchema.safeParse(1).success).toBe(false);
    expect(FinishReasonSchema.safeParse(null).success).toBe(false);
  });
});

describe("各个部分的 schema", () => {
  test("ToolCallDeltaSchema：index 必须是非负整数", () => {
    expect(ToolCallDeltaSchema.parse({ index: 0 })).toEqual({ index: 0 });
    for (const index of [-1, 1.5, "0", undefined]) {
      expect(ToolCallDeltaSchema.safeParse({ index }).success).toBe(false);
    }
  });

  test("ToolCallDeltaSchema：其他字段可以缺少或者是 null", () => {
    const full = { index: 1, id: "call_1", function: { name: "read_file", arguments: '{"pa' } };
    expect(ToolCallDeltaSchema.parse(full)).toEqual(full);
    expect(ToolCallDeltaSchema.parse({ index: 0, id: null, function: null })).toEqual({
      index: 0,
      id: null,
      function: null,
    });
    expect(ToolCallDeltaSchema.parse({ index: 0, function: { arguments: "x" } })).toEqual({
      index: 0,
      function: { arguments: "x" },
    });
    expect(ToolCallDeltaSchema.safeParse({ index: 0, function: { name: 1 } }).success).toBe(false);
  });

  test("ChoiceSchema：可以只有 finish_reason，也可以什么都没有", () => {
    expect(ChoiceSchema.parse({ finish_reason: "stop" })).toEqual({ finish_reason: "stop" });
    expect(ChoiceSchema.parse({})).toEqual({});
    expect(ChoiceSchema.parse({ delta: null, finish_reason: null })).toEqual({
      delta: null,
      finish_reason: null,
    });
  });

  test("UsageSchema", () => {
    expect(UsageSchema.parse({ prompt_tokens: 10, completion_tokens: 2 })).toEqual({
      prompt_tokens: 10,
      completion_tokens: 2,
    });
    expect(UsageSchema.safeParse({ prompt_tokens: 10 }).success).toBe(false);
    expect(UsageSchema.safeParse({ prompt_tokens: -1, completion_tokens: 0 }).success).toBe(false);
    expect(
      UsageSchema.safeParse({
        prompt_tokens: 1,
        completion_tokens: 1,
        prompt_tokens_details: { cached_tokens: 0.5 },
      }).success,
    ).toBe(false);
  });

  test("ChatChunkSchema：choices 缺少时是 []", () => {
    expect(ChatChunkSchema.parse({})).toEqual({ choices: [] });
  });
});

describe("parseChunk", () => {
  test("OpenAI 的文本增量", () => {
    expect(
      chunk({
        id: "chatcmpl-1",
        object: "chat.completion.chunk",
        created: 1,
        model: "gpt-5",
        choices: [{ index: 0, delta: { role: "assistant", content: "你好" }, finish_reason: null }],
      }),
    ).toEqual({ choices: [{ delta: { content: "你好" }, finish_reason: null }] });
  });

  test("工具调用的增量", () => {
    const result = chunk({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                type: "function",
                function: { name: "read_file", arguments: "" },
              },
            ],
          },
        },
      ],
    });
    expect(result).toEqual({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: "call_1", function: { name: "read_file", arguments: "" } },
            ],
          },
        },
      ],
    });
  });

  test("最后一个块：choices 为空，带 usage（DeepSeek 还会多出几个字段）", () => {
    expect(
      chunk({
        choices: [],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
          prompt_cache_hit_tokens: 64,
          prompt_tokens_details: { cached_tokens: 64 },
        },
      }),
    ).toEqual({
      choices: [],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        prompt_tokens_details: { cached_tokens: 64 },
      },
    });
  });

  test("null 原样保留；不认识的 finish_reason 变成 other", () => {
    expect(
      chunk({
        choices: [
          {
            delta: { content: null, tool_calls: null },
            finish_reason: "insufficient_system_resource",
          },
        ],
        usage: null,
      }),
    ).toEqual({
      choices: [{ delta: { content: null, tool_calls: null }, finish_reason: "other" }],
      usage: null,
    });
  });

  test("流中的错误", () => {
    expect(chunk({ error: { message: "过载了", code: 529 } })).toEqual({
      choices: [],
      error: { message: "过载了" },
    });
    expect(chunk({ error: {} })).toEqual({ choices: [], error: {} });
  });

  test("不是 JSON：信息带上数据的前 100 个字符，cause 是 JSON.parse 的错误", () => {
    const data = `{${"x".repeat(200)}`;
    let caught: unknown;
    try {
      parseChunk(data);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(`无法解析的数据：${data.slice(0, 100)}`);
    expect((caught as Error).cause).toBeInstanceOf(SyntaxError);
  });

  test("格式不对：信息是 prettifyError 的结果，cause 是 ZodError", () => {
    const data = JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: -1 }] } }] });
    let caught: unknown;
    try {
      parseChunk(data);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const cause = (caught as Error).cause;
    expect(cause).toBeInstanceOf(z.ZodError);
    expect((caught as Error).message).toBe(
      `数据格式不对：\n${z.prettifyError(cause as z.ZodError)}`,
    );
    expect((caught as Error).message).toContain("choices[0].delta.tool_calls[0].index");
  });

  test("字段存在但类型不对时报错，而不是悄悄当成空的", () => {
    expect(() => chunk({ choices: "oops" })).toThrow("数据格式不对");
    expect(() => chunk({ choices: [{ delta: { content: 1 } }] })).toThrow("数据格式不对");
    expect(() => chunk([])).toThrow("数据格式不对");
    expect(() => chunk(null)).toThrow("数据格式不对");
  });
});
