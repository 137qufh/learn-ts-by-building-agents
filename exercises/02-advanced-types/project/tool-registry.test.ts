import { describe, expect, test } from "vitest";
import { createRegistry, defineTool, toSchema, validateArgs } from "./tool-registry.ts";

const weatherSpec = {
  city: { type: "string", description: "城市名" },
  days: { type: "number", optional: true },
  unit: { type: "enum", values: ["c", "f"] },
  verbose: { type: "boolean", optional: true },
} as const;

describe("第三部分：validateArgs", () => {
  test("合法的参数", () => {
    const input = { city: "北京", unit: "c" };
    expect(validateArgs(weatherSpec, input)).toStrictEqual({ ok: true, value: input });
  });

  test("可选参数可以提供", () => {
    const input = { city: "北京", unit: "f", days: 3, verbose: false };
    expect(validateArgs(weatherSpec, input)).toStrictEqual({ ok: true, value: input });
  });

  test.each([null, [], "北京", 42, undefined])("不是对象：%j", (input) => {
    expect(validateArgs(weatherSpec, input)).toStrictEqual({
      ok: false,
      errors: ["参数必须是一个对象"],
    });
  });

  test("缺少必需参数", () => {
    expect(validateArgs(weatherSpec, {})).toStrictEqual({
      ok: false,
      errors: ['缺少参数 "city"', '缺少参数 "unit"'],
    });
  });

  test("值为 undefined 也算缺少", () => {
    expect(validateArgs(weatherSpec, { city: undefined, unit: "c" })).toStrictEqual({
      ok: false,
      errors: ['缺少参数 "city"'],
    });
  });

  test("类型不对", () => {
    expect(
      validateArgs(weatherSpec, { city: 1, days: "3", unit: "kelvin", verbose: "yes" }),
    ).toStrictEqual({
      ok: false,
      errors: [
        '参数 "city" 应该是 string',
        '参数 "days" 应该是 number',
        '参数 "unit" 应该是 "c" | "f" 之一',
        '参数 "verbose" 应该是 boolean',
      ],
    });
  });

  test("NaN 和 Infinity 不是合法的 number", () => {
    for (const days of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateArgs(weatherSpec, { city: "北京", unit: "c", days })).toStrictEqual({
        ok: false,
        errors: ['参数 "days" 应该是 number'],
      });
    }
  });

  test("enum 的值必须是字符串", () => {
    expect(validateArgs(weatherSpec, { city: "北京", unit: 1 })).toStrictEqual({
      ok: false,
      errors: ['参数 "unit" 应该是 "c" | "f" 之一'],
    });
  });

  test("未知参数排在最后，按 input 的顺序", () => {
    expect(validateArgs(weatherSpec, { town: "北京", unit: "c", lang: "zh" })).toStrictEqual({
      ok: false,
      errors: ['缺少参数 "city"', '未知参数 "town"', '未知参数 "lang"'],
    });
  });

  test("不会把原型上的属性当成参数", () => {
    expect(validateArgs({}, { toString: "x" })).toStrictEqual({
      ok: false,
      errors: ['未知参数 "toString"'],
    });
    expect(validateArgs({ name: { type: "string" } }, {})).toStrictEqual({
      ok: false,
      errors: ['缺少参数 "name"'],
    });
  });

  test("没有参数的工具接受空对象", () => {
    expect(validateArgs({}, {})).toStrictEqual({ ok: true, value: {} });
  });
});

// 这里的工具直接写成普通对象，而不是用 defineTool 定义：defineTool 在运行时只是原样返回，
// 这样即使你还没实现 defineTool，后面的测试也能运行。
const weather = {
  name: "get_weather",
  description: "查询城市天气",
  parameters: weatherSpec,
  execute: (args: { city: string }) => ({ city: args.city, condition: "晴" }),
} as const;

const add = {
  name: "add",
  description: "两数相加",
  parameters: { a: { type: "number" }, b: { type: "number" } },
  execute: (args: { a: number; b: number }) => args.a + args.b,
} as const;

const failing = {
  name: "fail",
  description: "总是失败",
  parameters: { kind: { type: "enum", values: ["error", "string"] } },
  execute: (args: { kind: string }): never => {
    if (args.kind === "error") {
      throw new Error("磁盘已满");
    }
    throw "不是 Error 的异常";
  },
} as const;

describe("第二部分：defineTool", () => {
  test("原样返回", () => {
    const tool = {
      name: "noop",
      description: "什么也不做",
      parameters: {},
      execute: () => null,
    };
    expect(defineTool(tool)).toBe(tool);
  });
});

describe("第四部分：toSchema", () => {
  test("生成 JSON Schema", () => {
    expect(toSchema(weather)).toStrictEqual({
      name: "get_weather",
      description: "查询城市天气",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市名" },
          days: { type: "number" },
          unit: { type: "string", enum: ["c", "f"] },
          verbose: { type: "boolean" },
        },
        required: ["city", "unit"],
        additionalProperties: false,
      },
    });
  });

  test("没有参数的工具", () => {
    const noop = { name: "noop", description: "", parameters: {}, execute: () => null };
    expect(toSchema(noop).parameters).toStrictEqual({
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    });
  });

  test("enum 数组是新数组，修改它不影响工具定义", () => {
    const schema = toSchema(weather);
    schema.parameters.properties["unit"]?.enum?.push("k");
    expect(weatherSpec.unit.values).toStrictEqual(["c", "f"]);
  });
});

describe("第五部分：注册表", () => {
  // 每个测试各自创建注册表（放在函数里，而不是在 describe 里直接调用，这样 createRegistry 还没实现时
  // 只有用到它的测试失败，而不是整个文件都无法加载）
  const makeTools = () => createRegistry().register(weather).register(add).register(failing);

  test("names 按注册顺序", () => {
    expect(makeTools().names()).toStrictEqual(["get_weather", "add", "fail"]);
  });

  test("register 返回新的注册表，原注册表不变", () => {
    const empty = createRegistry();
    const one = empty.register(add);
    expect(empty.names()).toStrictEqual([]);
    expect(one.names()).toStrictEqual(["add"]);
  });

  test("重复注册时抛出异常", () => {
    const one = createRegistry().register(add);
    // 完成挑战后，重复注册在类型上就不允许了；这里用 as never 绕过类型检查，验证运行时也会拒绝
    expect(() => one.register(add as never)).toThrow('工具 "add" 已经注册过了');
  });

  test("has", () => {
    expect(makeTools().has("add")).toBe(true);
    expect(makeTools().has("search")).toBe(false);
    expect(makeTools().has("toString")).toBe(false);
  });

  test("call 直接调用工具", () => {
    expect(makeTools().call("add", { a: 1, b: 2 })).toBe(3);
    expect(makeTools().call("get_weather", { city: "北京", unit: "c" })).toStrictEqual({
      city: "北京",
      condition: "晴",
    });
  });

  test("schemas 按注册顺序", () => {
    expect(
      makeTools()
        .schemas()
        .map((schema: { name: string }) => schema.name),
    ).toStrictEqual(["get_weather", "add", "fail"]);
    expect(makeTools().schemas()[1]).toStrictEqual(toSchema(add));
  });

  describe("dispatch", () => {
    test("成功", () => {
      expect(
        makeTools().dispatch({ id: "call_1", name: "add", arguments: '{"a":1,"b":2}' }),
      ).toStrictEqual({ id: "call_1", ok: true, value: 3 });
    });

    test("未知工具", () => {
      expect(makeTools().dispatch({ id: "call_2", name: "search", arguments: "{}" })).toStrictEqual(
        {
          id: "call_2",
          ok: false,
          error: '未知工具 "search"',
        },
      );
    });

    test("不会把原型上的属性当成工具", () => {
      expect(
        makeTools().dispatch({ id: "call_3", name: "constructor", arguments: "{}" }),
      ).toStrictEqual({
        id: "call_3",
        ok: false,
        error: '未知工具 "constructor"',
      });
    });

    test("参数不是合法的 JSON", () => {
      expect(
        makeTools().dispatch({ id: "call_4", name: "add", arguments: "{a: 1}" }),
      ).toStrictEqual({
        id: "call_4",
        ok: false,
        error: "参数不是合法的 JSON",
      });
    });

    test("参数校验失败时，所有错误用 ；连接", () => {
      expect(
        makeTools().dispatch({ id: "call_5", name: "add", arguments: '{"a":"1"}' }),
      ).toStrictEqual({
        id: "call_5",
        ok: false,
        error: '参数 "a" 应该是 number；缺少参数 "b"',
      });
    });

    test("参数是合法 JSON 但不是对象", () => {
      expect(
        makeTools().dispatch({ id: "call_6", name: "add", arguments: "[1, 2]" }),
      ).toStrictEqual({
        id: "call_6",
        ok: false,
        error: "参数必须是一个对象",
      });
    });

    test("工具抛出 Error", () => {
      expect(
        makeTools().dispatch({ id: "call_7", name: "fail", arguments: '{"kind":"error"}' }),
      ).toStrictEqual({ id: "call_7", ok: false, error: "工具执行失败：磁盘已满" });
    });

    test("工具抛出的不是 Error", () => {
      expect(
        makeTools().dispatch({ id: "call_8", name: "fail", arguments: '{"kind":"string"}' }),
      ).toStrictEqual({ id: "call_8", ok: false, error: "工具执行失败：不是 Error 的异常" });
    });

    test("校验失败时不会执行工具", () => {
      let executed = false;
      const spy = {
        name: "spy",
        description: "",
        parameters: { n: { type: "number" } },
        execute: () => {
          executed = true;
        },
      } as const;
      createRegistry().register(spy).dispatch({ id: "call_9", name: "spy", arguments: "{}" });
      expect(executed).toBe(false);
    });
  });
});
