import { describe, expectTypeOf, test } from "vitest";
import {
  defineTools,
  getField,
  type AllStrings,
  type DeepPartial,
  type EventField,
  type NewMessage,
  type ToolNameOf,
} from "./08-fix-the-types.ts";

describe("bug 1：NewMessage", () => {
  test("仍然是三种消息的联合，各自保留特有的字段", () => {
    expectTypeOf<NewMessage>().toEqualTypeOf<
      | { role: "user"; content: string }
      | { role: "assistant"; content: string; model: string }
      | { role: "tool"; toolCallId: string; content: string }
    >();
  });

  test("可以创建一条工具消息", () => {
    const message: NewMessage = { role: "tool", toolCallId: "call_1", content: "晴" };
    expectTypeOf(message).toExtend<NewMessage>();
  });
});

describe("bug 2：EventField", () => {
  test("包含所有事件的字段", () => {
    expectTypeOf<EventField>().toEqualTypeOf<"type" | "model" | "name" | "args" | "durationMs">();
  });
});

describe("bug 3：AllStrings", () => {
  test("单个类型", () => {
    expectTypeOf<AllStrings<"a">>().toEqualTypeOf<true>();
    expectTypeOf<AllStrings<1>>().toEqualTypeOf<false>();
  });

  test("联合要整体判断", () => {
    expectTypeOf<AllStrings<"a" | "b">>().toEqualTypeOf<true>();
    expectTypeOf<AllStrings<"a" | 1>>().toEqualTypeOf<false>();
  });
});

describe("bug 4：DeepPartial", () => {
  interface Config {
    model: { name: string; temperature: number };
    onEvent: (name: string) => void;
  }

  test("嵌套的对象每一层都可选", () => {
    expectTypeOf<DeepPartial<Config>["model"]>().toEqualTypeOf<
      { name?: string; temperature?: number } | undefined
    >();
  });

  test("函数保持原样", () => {
    expectTypeOf<DeepPartial<Config>["onEvent"]>().toEqualTypeOf<
      ((name: string) => void) | undefined
    >();
  });
});

describe("bug 5：getField", () => {
  test("返回值的类型随键变化", () => {
    const settings = { model: "gpt-5", maxTokens: 1024 };
    expectTypeOf(getField(settings, "maxTokens")).toEqualTypeOf<number>();
    expectTypeOf(getField(settings, "model")).toEqualTypeOf<string>();
  });
});

describe("bug 6：defineTools", () => {
  test("保留工具名的字面量类型", () => {
    const tools = defineTools([
      { name: "search", description: "搜索" },
      { name: "read_file", description: "读文件" },
    ]);
    expectTypeOf<ToolNameOf<typeof tools>>().toEqualTypeOf<"search" | "read_file">();
  });
});
