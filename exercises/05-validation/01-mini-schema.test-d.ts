import { describe, expectTypeOf, test } from "vitest";
import {
  array,
  boolean,
  literal,
  number,
  object,
  optional,
  string,
  union,
  type Infer,
  type InferShape,
  type OptionalSchema,
  type Schema,
} from "./01-mini-schema.ts";

describe("Infer", () => {
  test("取出 schema 校验的类型", () => {
    expectTypeOf<Infer<Schema<string>>>().toEqualTypeOf<string>();
    expectTypeOf<Infer<Schema<{ a: number }>>>().toEqualTypeOf<{ a: number }>();
  });

  test("不是 schema 时是 never", () => {
    expectTypeOf<Infer<string>>().toEqualTypeOf<never>();
  });

  test("optional 的类型带 undefined", () => {
    expectTypeOf<Infer<OptionalSchema<number>>>().toEqualTypeOf<number | undefined>();
  });
});

describe("InferShape", () => {
  test("必选和可选的键，可选的键不带 undefined", () => {
    expectTypeOf<InferShape<{ a: Schema<string>; b: OptionalSchema<number> }>>().toEqualTypeOf<{
      a: string;
      b?: number;
    }>();
  });

  test("全部必选", () => {
    expectTypeOf<InferShape<{ x: Schema<boolean> }>>().toEqualTypeOf<{ x: boolean }>();
  });
});

describe("组合起来", () => {
  test("基本类型和 literal", () => {
    expectTypeOf<Infer<ReturnType<typeof string>>>().toEqualTypeOf<string>();
    expectTypeOf<Infer<ReturnType<typeof number>>>().toEqualTypeOf<number>();
    expectTypeOf<Infer<ReturnType<typeof boolean>>>().toEqualTypeOf<boolean>();
    const role = literal("user");
    expectTypeOf<Infer<typeof role>>().toEqualTypeOf<"user">();
  });

  test("嵌套的对象、数组、联合", () => {
    // 这些 schema 只用来取类型，不会运行（题目没做完时，运行它们会抛出 TODO）
    const makeMessage = () =>
      object({
        role: union(literal("user"), literal("assistant")),
        content: string(),
        toolCalls: optional(array(object({ id: string(), name: string() }))),
      });
    expectTypeOf<Infer<ReturnType<typeof makeMessage>>>().toEqualTypeOf<{
      role: "user" | "assistant";
      content: string;
      toolCalls?: { id: string; name: string }[];
    }>();
  });

  test("union 的类型是各个选项的联合", () => {
    const makeId = () => union(string(), number());
    expectTypeOf<Infer<ReturnType<typeof makeId>>>().toEqualTypeOf<string | number>();
  });
});
