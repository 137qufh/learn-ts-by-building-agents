import { describe, expectTypeOf, test } from "vitest";
import { allObject, type AwaitedObject } from "./05-batch.ts";

describe("AwaitedObject", () => {
  test("把 Promise 换成兑现的值", () => {
    expectTypeOf<AwaitedObject<{ a: Promise<string>; b: number }>>().toEqualTypeOf<{
      a: string;
      b: number;
    }>();
  });

  test("嵌套的 Promise 也展开", () => {
    expectTypeOf<AwaitedObject<{ a: Promise<Promise<boolean>> }>>().toEqualTypeOf<{ a: boolean }>();
  });

  test("保留可选属性", () => {
    expectTypeOf<AwaitedObject<{ a?: Promise<string> }>>().toEqualTypeOf<{ a?: string }>();
  });
});

describe("allObject", () => {
  test("推断出每个键的类型", async () => {
    const result = await allObject({
      name: Promise.resolve("Matt"),
      models: Promise.resolve(["gpt-5"]),
      n: 1,
    });
    expectTypeOf(result).toEqualTypeOf<{ name: string; models: string[]; n: number }>();
  });

  test("参数必须是对象", () => {
    // @ts-expect-error -- 不能传入字符串
    void allObject("不是对象");
  });
});
