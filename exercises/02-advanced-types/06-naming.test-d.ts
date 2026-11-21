import { describe, expectTypeOf, test } from "vitest";
import {
  camelizeKeys,
  isNamespaced,
  namespaced,
  parseToolName,
  toCamelCase,
  type CamelCase,
  type CamelizeKeys,
  type Namespaced,
  type ParsedToolName,
} from "./06-naming.ts";

describe("Namespaced", () => {
  test("拼接", () => {
    expectTypeOf<Namespaced<"github", "search">>().toEqualTypeOf<"github__search">();
  });

  test("联合会展开", () => {
    expectTypeOf<Namespaced<"github" | "docs", "search">>().toEqualTypeOf<
      "github__search" | "docs__search"
    >();
  });
});

describe("ParsedToolName", () => {
  test("拆开字面量", () => {
    expectTypeOf<ParsedToolName<"github__search">>().toEqualTypeOf<{
      server: "github";
      tool: "search";
    }>();
    expectTypeOf<ParsedToolName<"a__b__c">>().toEqualTypeOf<{ server: "a"; tool: "b__c" }>();
  });

  test("没有 __ 的字面量是 undefined", () => {
    expectTypeOf<ParsedToolName<"search">>().toEqualTypeOf<undefined>();
  });

  test("宽泛的 string", () => {
    expectTypeOf<ParsedToolName<string>>().toEqualTypeOf<
      { server: string; tool: string } | undefined
    >();
  });
});

describe("CamelCase", () => {
  test("转换", () => {
    expectTypeOf<CamelCase<"finish_reason">>().toEqualTypeOf<"finishReason">();
    expectTypeOf<CamelCase<"prompt_tokens_details">>().toEqualTypeOf<"promptTokensDetails">();
    expectTypeOf<CamelCase<"content">>().toEqualTypeOf<"content">();
    expectTypeOf<CamelCase<"a__b">>().toEqualTypeOf<"aB">();
    expectTypeOf<CamelCase<"trailing_">>().toEqualTypeOf<"trailing">();
  });
});

describe("CamelizeKeys", () => {
  test("转换第一层的键，值不变", () => {
    expectTypeOf<
      CamelizeKeys<{ finish_reason: "stop"; usage: { prompt_tokens: number } }>
    >().toEqualTypeOf<{ finishReason: "stop"; usage: { prompt_tokens: number } }>();
  });
});

describe("namespaced", () => {
  test("返回精确的类型", () => {
    expectTypeOf(namespaced("github", "search")).toEqualTypeOf<"github__search">();
  });
});

describe("isNamespaced", () => {
  test("是类型守卫", () => {
    const name: string = "github__search";
    if (isNamespaced(name)) {
      expectTypeOf(name).toEqualTypeOf<`${string}__${string}`>();
    }
  });
});

describe("parseToolName", () => {
  test("字面量得到精确的结果", () => {
    expectTypeOf(parseToolName("github__search")).toEqualTypeOf<{
      server: "github";
      tool: "search";
    }>();
  });

  test("来自外部的 string 需要检查 undefined", () => {
    const fromModel: string = "github__search";
    expectTypeOf(parseToolName(fromModel)).toEqualTypeOf<
      { server: string; tool: string } | undefined
    >();
  });
});

describe("toCamelCase / camelizeKeys", () => {
  test("返回转换后的类型", () => {
    expectTypeOf(toCamelCase("finish_reason")).toEqualTypeOf<"finishReason">();
    expectTypeOf(camelizeKeys({ total_tokens: 3 })).toEqualTypeOf<{ totalTokens: number }>();
  });
});
