import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  defineFunction,
  strictFunction,
  strictProblems,
  toolParameters,
  type JsonSchema,
} from "./04-tool-schema.ts";

const ReadFile = z.object({
  path: z.string().min(1).describe("文件路径"),
  maxLines: z.number().int().min(1).max(2000).optional(),
});

const Search = z.object({
  query: z.string(),
  limit: z.number().int().min(1).max(50).default(10),
});

describe("toolParameters", () => {
  test("生成对象的 JSON Schema，不带 $schema", () => {
    expect(toolParameters(ReadFile)).toEqual({
      type: "object",
      properties: {
        path: { type: "string", minLength: 1, description: "文件路径" },
        maxLines: { type: "integer", minimum: 1, maximum: 2000 },
      },
      required: ["path"],
    });
  });

  test("描述的是输入：有默认值的字段不是必填的", () => {
    expect(toolParameters(Search).required).toEqual(["query"]);
  });

  test("带转换的 schema 也能生成（只描述输入）", () => {
    const Csv = z.object({ tags: z.string().transform((text) => text.split(",")) });
    expect(toolParameters(Csv).properties).toEqual({ tags: { type: "string" } });
  });

  test("根不是对象时报错", () => {
    expect(() => toolParameters(z.string())).toThrow("工具参数的根必须是 object");
    expect(() => toolParameters(z.array(z.string()))).toThrow("工具参数的根必须是 object");
    const Union = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("a") }),
      z.object({ kind: z.literal("b") }),
    ]);
    expect(() => toolParameters(Union)).toThrow("工具参数的根必须是 object");
  });
});

describe("defineFunction", () => {
  test("组装 name、description、parameters，没有 strict", () => {
    const fn = defineFunction("read_file", "读取文件", ReadFile);
    expect(fn).toEqual({
      name: "read_file",
      description: "读取文件",
      parameters: toolParameters(ReadFile),
    });
    expect("strict" in fn).toBe(false);
  });

  test("工具名：字母、数字、下划线、连字符，1 到 64 个字符", () => {
    expect(defineFunction("get-weather_2", "", ReadFile).name).toBe("get-weather_2");
    expect(defineFunction("a".repeat(64), "", ReadFile).name).toHaveLength(64);
    for (const bad of ["", "read file", "读取", "a.b", "a".repeat(65)]) {
      expect(() => defineFunction(bad, "", ReadFile)).toThrow(`工具名不合法：${bad}`);
    }
  });
});

describe("strictProblems", () => {
  test("符合规则的 schema 没有问题", () => {
    const ok: JsonSchema = {
      type: "object",
      properties: { a: { type: "string" }, b: { anyOf: [{ type: "number" }, { type: "null" }] } },
      required: ["a", "b"],
      additionalProperties: false,
    };
    expect(strictProblems(ok)).toEqual([]);
  });

  test("根不是 object", () => {
    expect(strictProblems({ type: "string" })).toEqual([{ path: "#", message: "根必须是 object" }]);
    expect(strictProblems({ anyOf: [{ type: "string" }] })).toEqual([
      { path: "#", message: "根必须是 object" },
    ]);
  });

  test("对象：缺少 additionalProperties: false，属性不在 required 里", () => {
    expect(
      strictProblems({
        type: "object",
        properties: { a: { type: "string" }, b: { type: "string" }, c: { type: "string" } },
        required: ["b"],
      }),
    ).toEqual([
      { path: "#", message: "必须设置 additionalProperties: false" },
      { path: "#", message: "a 必须出现在 required 里" },
      { path: "#", message: "c 必须出现在 required 里" },
    ]);
  });

  test("additionalProperties 是 true 或 {} 也不行；没有 required 时每个属性都报告", () => {
    expect(
      strictProblems({ type: "object", properties: { a: {} }, additionalProperties: true }),
    ).toEqual([
      { path: "#", message: "必须设置 additionalProperties: false" },
      { path: "#", message: "a 必须出现在 required 里" },
    ]);
    expect(strictProblems({ type: "object", properties: {}, additionalProperties: {} })).toEqual([
      { path: "#", message: "必须设置 additionalProperties: false" },
    ]);
  });

  test("不支持的关键字，按规定的顺序报告", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {},
      additionalProperties: false,
      dependentRequired: {},
      not: {},
      allOf: [],
    };
    expect(strictProblems(schema).map((problem) => problem.message)).toEqual([
      "不支持 allOf",
      "不支持 not",
      "不支持 dependentRequired",
    ]);
  });

  test("递归检查子 schema，path 是 JSON Pointer 风格", () => {
    const loose = { type: "object", properties: { x: { type: "string" } } } as const;
    const schema: JsonSchema = {
      type: "object",
      properties: {
        user: { ...loose },
        list: { type: "array", items: { ...loose } },
        pair: { type: "array", prefixItems: [{ type: "string" }, { ...loose }] },
        either: { anyOf: [{ type: "null" }, { ...loose }] },
        one: { oneOf: [{ ...loose }] },
        map: { type: "object", additionalProperties: { ...loose } },
      },
      required: ["user", "list", "pair", "either", "one", "map"],
      additionalProperties: false,
      $defs: { Thing: { ...loose } },
    };
    expect(strictProblems(schema).map((problem) => problem.path)).toEqual([
      "#/properties/user",
      "#/properties/user",
      "#/properties/list/items",
      "#/properties/list/items",
      "#/properties/pair/prefixItems/1",
      "#/properties/pair/prefixItems/1",
      "#/properties/either/anyOf/1",
      "#/properties/either/anyOf/1",
      "#/properties/one",
      "#/properties/one/oneOf/0",
      "#/properties/one/oneOf/0",
      "#/properties/map",
      "#/properties/map/additionalProperties",
      "#/properties/map/additionalProperties",
      "#/$defs/Thing",
      "#/$defs/Thing",
    ]);
  });

  test("当前 schema 的问题在子 schema 的问题之前", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        inner: { type: "object", properties: {}, additionalProperties: false, not: {} },
      },
    };
    expect(strictProblems(schema)).toEqual([
      { path: "#", message: "必须设置 additionalProperties: false" },
      { path: "#", message: "inner 必须出现在 required 里" },
      { path: "#/properties/inner", message: "不支持 not" },
    ]);
  });

  test("items 是 false（元组）或布尔值时不当作子 schema", () => {
    const schema = toolParameters(z.strictObject({ pair: z.tuple([z.string(), z.number()]) }));
    expect(strictProblems(schema)).toEqual([]);
  });

  test("不修改传入的 schema", () => {
    const schema: JsonSchema = { type: "object", properties: { a: {} } };
    const copy = structuredClone(schema);
    strictProblems(schema);
    expect(schema).toEqual(copy);
  });
});

describe("strictFunction", () => {
  const StrictSearch = z.object({
    query: z.string(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .nullable()
      .transform((limit) => limit ?? 10),
    filters: z.object({ lang: z.enum(["ts", "js"]).nullable() }),
  });

  test("每个对象都补上 additionalProperties: false，并带上 strict: true", () => {
    const fn = strictFunction("search", "搜索代码", StrictSearch);
    expect(fn).toEqual({
      name: "search",
      description: "搜索代码",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { anyOf: [{ type: "integer", minimum: 1, maximum: 50 }, { type: "null" }] },
          filters: {
            type: "object",
            properties: {
              lang: { anyOf: [{ type: "string", enum: ["ts", "js"] }, { type: "null" }] },
            },
            required: ["lang"],
            additionalProperties: false,
          },
        },
        required: ["query", "limit", "filters"],
        additionalProperties: false,
      },
    });
    expect(strictProblems(fn.parameters)).toEqual([]);
  });

  test("不覆盖已有的 additionalProperties（z.record 的值类型、looseObject）", () => {
    const WithRecord = z.object({ headers: z.record(z.string(), z.string()) });
    expect(() => strictFunction("http", "", WithRecord)).toThrow(
      "http 不符合严格模式：\n  #/properties/headers: 必须设置 additionalProperties: false",
    );
  });

  test("可选字段和默认值：列出所有问题", () => {
    expect(() => strictFunction("read_file", "", ReadFile)).toThrow(
      "read_file 不符合严格模式：\n  #: maxLines 必须出现在 required 里",
    );
    const Both = z.object({
      a: z.string().optional(),
      b: z.number().default(1),
      c: z.object({ d: z.boolean().optional() }),
    });
    let message = "";
    try {
      strictFunction("both", "", Both);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message.split("\n")).toEqual([
      "both 不符合严格模式：",
      "  #: a 必须出现在 required 里",
      "  #: b 必须出现在 required 里",
      "  #/properties/c: d 必须出现在 required 里",
    ]);
  });

  test("根不是对象、工具名不合法时同样报错", () => {
    expect(() => strictFunction("x", "", z.string())).toThrow("工具参数的根必须是 object");
    expect(() => strictFunction("a b", "", StrictSearch)).toThrow("工具名不合法：a b");
  });

  test("不改变 Zod schema 本身：之后的 toolParameters 不受影响", () => {
    strictFunction("search", "", StrictSearch);
    expect(toolParameters(StrictSearch).additionalProperties).toBeUndefined();
  });
});
