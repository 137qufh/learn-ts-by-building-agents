import { describe, expectTypeOf, test } from "vitest";
import {
  DEFAULT_SETTINGS,
  defaultModelOf,
  getSetting,
  pluck,
  withSetting,
  type DefaultModel,
  type ModelSettings,
  type ProviderName,
  type ValueOf,
} from "./02-settings.ts";

describe("ProviderName", () => {
  test("是 PROVIDERS 的键", () => {
    expectTypeOf<ProviderName>().toEqualTypeOf<"openai" | "anthropic" | "deepseek">();
  });
});

describe("DefaultModel", () => {
  test("得到默认模型的字面量类型", () => {
    expectTypeOf<DefaultModel<"deepseek">>().toEqualTypeOf<"deepseek-chat">();
  });

  test("传入联合时得到联合", () => {
    expectTypeOf<DefaultModel<"openai" | "anthropic">>().toEqualTypeOf<
      "gpt-5" | "claude-sonnet-4-5"
    >();
  });
});

describe("ValueOf", () => {
  test("所有属性值类型的联合", () => {
    expectTypeOf<ValueOf<{ a: 1; b: "x" }>>().toEqualTypeOf<1 | "x">();
    expectTypeOf<ValueOf<ModelSettings>>().toEqualTypeOf<
      string | number | boolean | readonly string[]
    >();
  });
});

describe("getSetting", () => {
  test("返回值的类型随键变化", () => {
    expectTypeOf(getSetting(DEFAULT_SETTINGS, "maxTokens")).toEqualTypeOf<number>();
    expectTypeOf(getSetting(DEFAULT_SETTINGS, "stop")).toEqualTypeOf<readonly string[]>();
  });

  test("适用于任何对象", () => {
    expectTypeOf(getSetting({ city: "北京", days: 3 }, "days")).toEqualTypeOf<number>();
  });

  test("不存在的键报错", () => {
    // @ts-expect-error -- "maxToken" 不是 ModelSettings 的键
    getSetting(DEFAULT_SETTINGS, "maxToken");
  });
});

describe("withSetting", () => {
  test("返回同样类型的对象", () => {
    expectTypeOf(withSetting(DEFAULT_SETTINGS, "stream", false)).toEqualTypeOf<ModelSettings>();
  });

  test("值的类型必须和键对应", () => {
    // @ts-expect-error -- temperature 是 number
    withSetting(DEFAULT_SETTINGS, "temperature", "low");
  });

  test("不存在的键报错", () => {
    // @ts-expect-error -- "temp" 不是 ModelSettings 的键
    withSetting(DEFAULT_SETTINGS, "temp", 1);
  });
});

describe("pluck", () => {
  test("返回属性类型的数组", () => {
    const calls = [{ id: "call_1", attempts: 2 }];
    expectTypeOf(pluck(calls, "attempts")).toEqualTypeOf<number[]>();
  });

  test("不存在的键报错", () => {
    // @ts-expect-error -- 元素上没有 name
    pluck([{ id: "call_1" }], "name");
  });
});

describe("defaultModelOf", () => {
  test("返回字面量类型", () => {
    expectTypeOf(defaultModelOf("openai")).toEqualTypeOf<"gpt-5">();
  });

  test("只接受已知的供应商", () => {
    // @ts-expect-error -- 不是已知的供应商
    defaultModelOf("gemini");
  });
});
