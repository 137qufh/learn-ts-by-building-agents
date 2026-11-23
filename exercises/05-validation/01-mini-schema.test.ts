import { describe, expect, test } from "vitest";
import {
  array,
  boolean,
  formatIssues,
  literal,
  number,
  object,
  optional,
  string,
  typeName,
  union,
} from "./01-mini-schema.ts";

describe("typeName（已给出）", () => {
  test("区分 null、array、NaN", () => {
    expect([null, [], Number.NaN, 1, "x", undefined, {}].map(typeName)).toEqual([
      "null",
      "array",
      "NaN",
      "number",
      "string",
      "undefined",
      "object",
    ]);
  });
});

describe("基本类型", () => {
  test("string", () => {
    expect(string().parse("hi")).toEqual({ ok: true, value: "hi" });
    expect(string().parse(1)).toEqual({
      ok: false,
      issues: [{ path: [], message: "期望 string，收到 number" }],
    });
  });

  test("number：NaN 和 Infinity 不算", () => {
    expect(number().parse(0)).toEqual({ ok: true, value: 0 });
    expect(number().parse(Number.NaN)).toEqual({
      ok: false,
      issues: [{ path: [], message: "期望 number，收到 NaN" }],
    });
    expect(number().parse(Infinity).ok).toBe(false);
    expect(number().parse("1")).toEqual({
      ok: false,
      issues: [{ path: [], message: "期望 number，收到 string" }],
    });
  });

  test("boolean", () => {
    expect(boolean().parse(false)).toEqual({ ok: true, value: false });
    expect(boolean().parse(null)).toEqual({
      ok: false,
      issues: [{ path: [], message: "期望 boolean，收到 null" }],
    });
  });

  test("literal", () => {
    expect(literal("user").parse("user")).toEqual({ ok: true, value: "user" });
    expect(literal("user").parse("User")).toEqual({
      ok: false,
      issues: [{ path: [], message: '期望 "user"，收到 string' }],
    });
    expect(literal(42).parse(42)).toEqual({ ok: true, value: 42 });
  });

  test("path 参数原样出现在 issue 里", () => {
    expect(string().parse(1, ["a", 0])).toEqual({
      ok: false,
      issues: [{ path: ["a", 0], message: "期望 string，收到 number" }],
    });
  });

  test("optional：undefined 通过，其他值交给内层", () => {
    const schema = optional(number());
    expect(schema.optional).toBe(true);
    expect(string().optional).toBe(false);
    expect(schema.parse(undefined)).toEqual({ ok: true, value: undefined });
    expect(schema.parse(3)).toEqual({ ok: true, value: 3 });
    expect(schema.parse(null).ok).toBe(false); // null 不是 undefined
  });
});

describe("array", () => {
  test("每个元素都校验", () => {
    expect(array(number()).parse([1, 2])).toEqual({ ok: true, value: [1, 2] });
    expect(array(number()).parse([])).toEqual({ ok: true, value: [] });
  });

  test("报告所有出问题的元素，path 带上下标", () => {
    expect(array(number()).parse([1, "2", 3, null])).toEqual({
      ok: false,
      issues: [
        { path: [1], message: "期望 number，收到 string" },
        { path: [3], message: "期望 number，收到 null" },
      ],
    });
  });

  test("不是数组", () => {
    expect(array(number()).parse({ length: 0 })).toEqual({
      ok: false,
      issues: [{ path: [], message: "期望 array，收到 object" }],
    });
  });
});

describe("object", () => {
  const usage = () =>
    object({
      inputTokens: number(),
      outputTokens: number(),
      cachedInputTokens: optional(number()),
    });

  test("合法的输入", () => {
    expect(usage().parse({ inputTokens: 1, outputTokens: 2, cachedInputTokens: 0 })).toEqual({
      ok: true,
      value: { inputTokens: 1, outputTokens: 2, cachedInputTokens: 0 },
    });
  });

  test("可选的键缺少时，结果里没有这个键", () => {
    const result = usage().parse({ inputTokens: 1, outputTokens: 2 });
    expect(result).toEqual({ ok: true, value: { inputTokens: 1, outputTokens: 2 } });
    expect(result.ok && "cachedInputTokens" in result.value).toBe(false);
  });

  test("没有列出的键被丢掉", () => {
    expect(usage().parse({ inputTokens: 1, outputTokens: 2, extra: "x" })).toEqual({
      ok: true,
      value: { inputTokens: 1, outputTokens: 2 },
    });
  });

  test("缺少必选的键、类型不对：全部报告", () => {
    expect(usage().parse({ inputTokens: "1", cachedInputTokens: null })).toEqual({
      ok: false,
      issues: [
        { path: ["inputTokens"], message: "期望 number，收到 string" },
        { path: ["outputTokens"], message: "期望 number，收到 undefined" },
        { path: ["cachedInputTokens"], message: "期望 number，收到 null" },
      ],
    });
  });

  test.each([
    [null, "null"],
    [[], "array"],
    ["x", "string"],
  ])("%j 不是对象", (input, name) => {
    expect(usage().parse(input)).toEqual({
      ok: false,
      issues: [{ path: [], message: `期望 object，收到 ${name}` }],
    });
  });

  test("嵌套：path 一层层拼起来", () => {
    const transcript = object({
      messages: array(object({ role: literal("user"), content: string() })),
    });
    expect(
      transcript.parse({
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: 1 },
        ],
      }),
    ).toEqual({
      ok: false,
      issues: [
        { path: ["messages", 1, "role"], message: '期望 "user"，收到 string' },
        { path: ["messages", 1, "content"], message: "期望 string，收到 number" },
      ],
    });
  });

  test("不修改输入", () => {
    const input = { inputTokens: 1, outputTokens: 2, extra: true };
    usage().parse(input);
    expect(input).toEqual({ inputTokens: 1, outputTokens: 2, extra: true });
  });
});

describe("union", () => {
  test("返回第一个成功的结果", () => {
    const id = union(string(), number());
    expect(id.parse("a")).toEqual({ ok: true, value: "a" });
    expect(id.parse(1)).toEqual({ ok: true, value: 1 });
  });

  test("都失败时，在当前 path 报一个问题", () => {
    const role = union(literal("user"), literal("assistant"));
    expect(role.parse("tool", ["role"])).toEqual({
      ok: false,
      issues: [{ path: ["role"], message: "不符合任何一种情况" }],
    });
  });

  test("可以联合对象：结果是成功的那个 schema 处理过的值", () => {
    const event = union(
      object({ type: literal("text"), text: string() }),
      object({ type: literal("done") }),
    );
    expect(event.parse({ type: "done", extra: 1 })).toEqual({ ok: true, value: { type: "done" } });
  });
});

describe("formatIssues", () => {
  test("每行一个问题，根路径写 (根)", () => {
    expect(
      formatIssues([
        { path: ["messages", 2, "role"], message: '期望 "user"，收到 string' },
        { path: [], message: "期望 object，收到 null" },
      ]),
    ).toBe('messages.2.role: 期望 "user"，收到 string\n(根): 期望 object，收到 null');
  });

  test("没有问题时是空字符串", () => {
    expect(formatIssues([])).toBe("");
  });
});
