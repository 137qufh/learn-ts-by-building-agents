import { describe, expect, expectTypeOf, test } from "vitest";
import { z } from "zod";
import {
  extractJson,
  feedbackFor,
  formatPath,
  generateValidated,
  issuesForModel,
  parseToolArguments,
  type ChatTurn,
  type Generate,
} from "./05-repair-loop.ts";

describe("extractJson", () => {
  test("整段就是 JSON（允许首尾空白）", () => {
    expect(extractJson('  {"a": 1}\n')).toEqual({ ok: true, value: { a: 1 } });
    expect(extractJson("[1, 2]")).toEqual({ ok: true, value: [1, 2] });
    expect(extractJson("42")).toEqual({ ok: true, value: 42 });
  });

  test("Markdown 代码块：```json 或 ```", () => {
    const text = '好的，结果如下：\n```json\n{"city": "北京"}\n```\n还需要别的吗？';
    expect(extractJson(text)).toEqual({ ok: true, value: { city: "北京" } });
    expect(extractJson("看：\n```\n[true]\n```")).toEqual({ ok: true, value: [true] });
    expect(extractJson('用 { 包起来：\n```JSON\n{"x": null}\n```')).toEqual({
      ok: true,
      value: { x: null },
    });
  });

  test("只用第一个代码块；代码块里不是 JSON 时直接失败", () => {
    expect(extractJson('```json\n{"n": 1}\n```\n```json\n{"n": 2}\n```')).toEqual({
      ok: true,
      value: { n: 1 },
    });
    const result = extractJson('```json\n坏的\n```\n后面还有 {"a": 1}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toBe("JSON 不完整");
      expect(result.error).not.toBe("回答里没有 JSON");
    }
  });

  test("夹在文字里的对象或数组", () => {
    expect(extractJson('结果是 {"a": {"b": [1, 2]}}，请查收。')).toEqual({
      ok: true,
      value: { a: { b: [1, 2] } },
    });
    expect(extractJson("列表：[1, [2, 3]] 完毕 ]")).toEqual({ ok: true, value: [1, [2, 3]] });
  });

  test("配对时跳过字符串里的括号和转义的引号", () => {
    expect(extractJson('输出：{"text": "a } b ] c"} 尾巴 }')).toEqual({
      ok: true,
      value: { text: "a } b ] c" },
    });
    expect(extractJson('输出：{"q": "他说 \\"{\\" 和 \\\\"} 尾巴')).toEqual({
      ok: true,
      value: { q: '他说 "{" 和 \\' },
    });
  });

  test("没有 JSON、不完整、不配对", () => {
    expect(extractJson("我不知道。")).toEqual({ ok: false, error: "回答里没有 JSON" });
    expect(extractJson('结果：{"a": [1, 2')).toEqual({ ok: false, error: "JSON 不完整" });
    expect(extractJson("结果：[1, 2} ]")).toEqual({ ok: false, error: "JSON 不完整" });
  });

  test("括号配对了但内容不是 JSON：返回 JSON.parse 的错误信息", () => {
    const text = "结果：{a: 1}";
    const result = extractJson(text);
    let expected = "";
    try {
      JSON.parse("{a: 1}");
    } catch (error) {
      expected = (error as Error).message;
    }
    expect(result).toEqual({ ok: false, error: expected });
  });
});

describe("formatPath 和 issuesForModel", () => {
  test("formatPath", () => {
    expect(formatPath([])).toBe("(根)");
    expect(formatPath(["city"])).toBe("city");
    expect(formatPath(["steps", 0, "output"])).toBe("steps[0].output");
    expect(formatPath([0, "content"])).toBe("[0].content");
    expect(formatPath(["matrix", 1, 2])).toBe("matrix[1][2]");
  });

  test("issuesForModel：每个问题一行", () => {
    const schema = z.object({
      title: z.string({ error: "标题必须是字符串" }),
      tags: z.array(z.string().min(1, "标签不能为空")),
    });
    const result = schema.safeParse({ title: 1, tags: ["ok", ""] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(issuesForModel(result.error)).toBe(
        "- title: 标题必须是字符串\n- tags[1]: 标签不能为空",
      );
    }
  });

  test("issuesForModel：根上的问题", () => {
    const result = z.object({}).safeParse("x");
    if (!result.success) {
      expect(issuesForModel(result.error)).toMatch(/^- \(根\): /);
    }
    expect(result.success).toBe(false);
  });
});

describe("parseToolArguments", () => {
  const Args = z.object({
    city: z.string().min(1, "城市不能为空"),
    days: z.number().int().min(1).max(7).default(3),
  });

  test("成功：返回 schema 的输出", () => {
    expect(parseToolArguments('{"city": "北京"}', Args)).toEqual({
      ok: true,
      value: { city: "北京", days: 3 },
    });
  });

  test("结果类型是 schema 的输出类型", () => {
    const result = parseToolArguments("{}", Args);
    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<{ city: string; days: number }>();
    }
  });

  test("不是合法的 JSON", () => {
    const result = parseToolArguments('{"city": ', Args);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/^参数不是合法的 JSON：\S/);
    }
  });

  test("不符合 schema", () => {
    expect(parseToolArguments('{"city": ""}', Args)).toEqual({
      ok: false,
      error: "参数不符合要求：\n- city: 城市不能为空",
    });
  });
});

describe("generateValidated", () => {
  const Answer = z.object({
    answer: z.number({ error: "answer 必须是数字" }),
    steps: z.array(z.string()).min(1, "至少写一步"),
  });

  /** 按顺序返回预先写好的回答，并记录每次收到的对话。 */
  function scripted(...replies: string[]) {
    const calls: ChatTurn[][] = [];
    const generate: Generate = async (turns) => {
      calls.push(turns as ChatTurn[]);
      const reply = replies[calls.length - 1];
      if (reply === undefined) {
        throw new Error("脚本用完了");
      }
      return reply;
    };
    return { generate, calls };
  }

  test("第一次就对", async () => {
    const { generate, calls } = scripted('{"answer": 4, "steps": ["2 + 2 = 4"]}');
    const result = await generateValidated(generate, "2 + 2 = ?", Answer);
    expect(result).toEqual({ ok: true, value: { answer: 4, steps: ["2 + 2 = 4"] }, attempts: 1 });
    expect(calls).toEqual([[{ role: "user", content: "2 + 2 = ?" }]]);
  });

  test("结果类型是 schema 的输出类型", async () => {
    const { generate } = scripted('{"answer": 1, "steps": ["x"]}');
    const result = await generateValidated(generate, "", Answer);
    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<{ answer: number; steps: string[] }>();
    }
  });

  test("不合格时把原回答和问题追加到对话里，再试一次", async () => {
    const first = '```json\n{"answer": "4", "steps": []}\n```';
    const second = '{"answer": 4, "steps": ["2 + 2 = 4"]}';
    const { generate, calls } = scripted(first, second);
    const result = await generateValidated(generate, "2 + 2 = ?", Answer);
    expect(result).toEqual({ ok: true, value: { answer: 4, steps: ["2 + 2 = 4"] }, attempts: 2 });
    expect(calls[1]).toEqual([
      { role: "user", content: "2 + 2 = ?" },
      { role: "assistant", content: first },
      { role: "user", content: feedbackFor("- answer: answer 必须是数字\n- steps: 至少写一步") },
    ]);
  });

  test("每次传给 generate 的是副本：之后的修改不影响已经传出去的对话", async () => {
    const { generate, calls } = scripted(
      "不知道",
      "还是不知道",
      '{"answer": 1, "steps": ["猜的"]}',
    );
    await generateValidated(generate, "问题", Answer);
    expect(calls.map((turns) => turns.length)).toEqual([1, 3, 5]);
  });

  test("不是 JSON 的回答：反馈里说明原因", async () => {
    const { generate, calls } = scripted("我觉得是 4。", '{"answer": 4, "steps": ["心算"]}');
    await generateValidated(generate, "2 + 2 = ?", Answer);
    expect(calls[1]?.[2]).toEqual({
      role: "user",
      content: feedbackFor("- 不是合法的 JSON：回答里没有 JSON"),
    });
  });

  test("次数用完：返回每次的问题", async () => {
    const { generate, calls } = scripted("不知道", '{"answer": 1}', '{"steps": ["a"]}', "不会调用");
    const result = await generateValidated(generate, "问题", Answer);
    expect(result).toEqual({
      ok: false,
      attempts: 3,
      errors: [
        "- 不是合法的 JSON：回答里没有 JSON",
        expect.stringContaining("- steps: "),
        "- answer: answer 必须是数字",
      ],
    });
    expect(calls).toHaveLength(3);
  });

  test("maxAttempts", async () => {
    const once = scripted("不知道", '{"answer": 1, "steps": ["a"]}');
    expect(await generateValidated(once.generate, "", Answer, { maxAttempts: 1 })).toMatchObject({
      ok: false,
      attempts: 1,
    });
    expect(once.calls).toHaveLength(1);

    for (const bad of [0, -1, 1.5, Number.NaN]) {
      await expect(
        generateValidated(scripted().generate, "", Answer, { maxAttempts: bad }),
      ).rejects.toThrow(RangeError);
    }
  });

  test("generate 抛出的错误直接传出去", async () => {
    const generate: Generate = async () => {
      throw new Error("网络断了");
    };
    await expect(generateValidated(generate, "", Answer)).rejects.toThrow("网络断了");
  });

  test("用 schema 的输出：转换和默认值都生效", async () => {
    const Tags = z.object({ tags: z.string().transform((text) => text.split(",")) });
    const { generate } = scripted('{"tags": "a,b"}');
    expect(await generateValidated(generate, "", Tags)).toEqual({
      ok: true,
      value: { tags: ["a", "b"] },
      attempts: 1,
    });
  });
});
