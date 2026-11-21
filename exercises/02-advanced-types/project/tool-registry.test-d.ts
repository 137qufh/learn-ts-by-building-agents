import { describe, expectTypeOf, test } from "vitest";
import {
  createRegistry,
  defineTool,
  validateArgs,
  type ArgsOf,
  type DuplicateToolError,
  type InferArgs,
  type OptionalKeys,
  type ParamValue,
  type RequiredKeys,
  type ResultOf,
  type ToolByName,
  type ToolName,
} from "./tool-registry.ts";

const weatherSpec = {
  city: { type: "string", description: "城市名" },
  days: { type: "number", optional: true },
  unit: { type: "enum", values: ["c", "f"] },
  verbose: { type: "boolean", optional: true },
} as const;
type WeatherSpec = typeof weatherSpec;
type WeatherArgs = { city: string; unit: "c" | "f"; days?: number; verbose?: boolean };

describe("第一部分：从参数描述推导类型", () => {
  test("ParamValue", () => {
    expectTypeOf<ParamValue<{ type: "string" }>>().toEqualTypeOf<string>();
    expectTypeOf<ParamValue<{ type: "number"; optional: true }>>().toEqualTypeOf<number>();
    expectTypeOf<ParamValue<{ type: "boolean" }>>().toEqualTypeOf<boolean>();
    expectTypeOf<ParamValue<{ type: "enum"; values: readonly ["c", "f"] }>>().toEqualTypeOf<
      "c" | "f"
    >();
  });

  test("RequiredKeys / OptionalKeys", () => {
    expectTypeOf<RequiredKeys<WeatherSpec>>().toEqualTypeOf<"city" | "unit">();
    expectTypeOf<OptionalKeys<WeatherSpec>>().toEqualTypeOf<"days" | "verbose">();
  });

  test("optional: false 也是必需的", () => {
    expectTypeOf<RequiredKeys<{ a: { type: "string"; optional: false } }>>().toEqualTypeOf<"a">();
  });

  test("InferArgs", () => {
    expectTypeOf<InferArgs<WeatherSpec>>().toEqualTypeOf<WeatherArgs>();
  });

  test("没有参数时是空对象", () => {
    expectTypeOf<InferArgs<{}>>().toEqualTypeOf<{}>();
  });
});

const weather = defineTool({
  name: "get_weather",
  description: "查询城市天气",
  parameters: {
    city: { type: "string", description: "城市名" },
    days: { type: "number", optional: true },
    unit: { type: "enum", values: ["c", "f"] },
    verbose: { type: "boolean", optional: true },
  },
  execute: (args) => {
    expectTypeOf(args).toEqualTypeOf<WeatherArgs>();
    return { city: args.city, condition: "晴" };
  },
});

const add = defineTool({
  name: "add",
  description: "两数相加",
  parameters: { a: { type: "number" }, b: { type: "number" } },
  execute: ({ a, b }) => a + b,
});

type Tools = typeof weather | typeof add;

describe("第二部分：defineTool", () => {
  test("工具名是字面量类型", () => {
    expectTypeOf(weather.name).toEqualTypeOf<"get_weather">();
  });

  test("execute 的参数自动推断（见上面 weather 定义里的断言）", () => {
    expectTypeOf(add.execute).parameter(0).toEqualTypeOf<{ a: number; b: number }>();
  });

  test("execute 里用错参数会报错", () => {
    defineTool({
      name: "typo",
      description: "",
      parameters: { city: { type: "string" } },
      // @ts-expect-error -- 参数里没有 town
      execute: (args) => args.town,
    });
  });
});

describe("第三部分：validateArgs", () => {
  test("通过时 value 有精确的类型", () => {
    const result = validateArgs(weatherSpec, {});
    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<WeatherArgs>();
    } else {
      expectTypeOf(result.errors).toEqualTypeOf<string[]>();
    }
  });
});

describe("第五部分：注册表的类型", () => {
  test("ToolName / ToolByName / ArgsOf / ResultOf", () => {
    expectTypeOf<ToolName<Tools>>().toEqualTypeOf<"get_weather" | "add">();
    expectTypeOf<ToolByName<Tools, "add">>().toEqualTypeOf<typeof add>();
    expectTypeOf<ArgsOf<typeof weather>>().toEqualTypeOf<WeatherArgs>();
    expectTypeOf<ResultOf<typeof weather>>().toEqualTypeOf<{ city: string; condition: string }>();
  });

  const tools = createRegistry().register(weather).register(add);

  test("names", () => {
    expectTypeOf(tools.names()).toEqualTypeOf<("get_weather" | "add")[]>();
  });

  test("call 的参数和返回值随工具名变化", () => {
    expectTypeOf(tools.call("add", { a: 1, b: 2 })).toEqualTypeOf<number>();
    expectTypeOf(tools.call("get_weather", { city: "北京", unit: "c" })).toEqualTypeOf<{
      city: string;
      condition: string;
    }>();
  });

  test("call 检查工具名和参数", () => {
    // @ts-expect-error -- 没有这个工具
    tools.call("search", {});
    // @ts-expect-error -- 缺少参数 b
    tools.call("add", { a: 1 });
    // @ts-expect-error -- unit 只能是 "c" 或 "f"
    tools.call("get_weather", { city: "北京", unit: "k" });
  });

  test("has 是类型守卫", () => {
    const name: string = "add";
    if (tools.has(name)) {
      expectTypeOf(name).toEqualTypeOf<"get_weather" | "add">();
    }
  });

  test("空注册表没有可调用的工具", () => {
    // @ts-expect-error -- 空注册表里没有任何工具
    createRegistry().call("add", { a: 1, b: 2 });
  });
});

describe("挑战：重复注册在编译期报错", () => {
  test("DuplicateToolError", () => {
    expectTypeOf<DuplicateToolError<"search">>().toEqualTypeOf<`工具 "search" 已经注册过了`>();
  });

  test("重复注册报错", () => {
    const tools = createRegistry().register(add);
    // @ts-expect-error -- add 已经注册过了
    tools.register(add);
  });

  test("不重复的工具可以继续注册", () => {
    const tools = createRegistry().register(add).register(weather);
    expectTypeOf(tools.names()).toEqualTypeOf<("add" | "get_weather")[]>();
  });
});
