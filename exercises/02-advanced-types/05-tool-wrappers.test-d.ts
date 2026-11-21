import { describe, expectTypeOf, test } from "vitest";
import {
  memoize,
  recorded,
  withFallback,
  type CallRecord,
  type ElementOf,
  type FirstArg,
  type Last,
  type ResultsOf,
  type Unwrap,
} from "./05-tool-wrappers.ts";

describe("ElementOf", () => {
  test("数组和只读数组的元素类型", () => {
    expectTypeOf<ElementOf<string[]>>().toEqualTypeOf<string>();
    expectTypeOf<ElementOf<readonly { id: string }[]>>().toEqualTypeOf<{ id: string }>();
  });

  test("元组得到元素类型的联合", () => {
    expectTypeOf<ElementOf<[1, "a"]>>().toEqualTypeOf<1 | "a">();
  });

  test("不是数组时为 never", () => {
    expectTypeOf<ElementOf<string>>().toBeNever();
  });
});

describe("FirstArg", () => {
  test("第一个参数的类型", () => {
    expectTypeOf<FirstArg<(city: string, days: number) => void>>().toEqualTypeOf<string>();
  });

  test("没有参数时为 never", () => {
    expectTypeOf<FirstArg<() => void>>().toBeNever();
  });

  test("不是函数时为 never", () => {
    expectTypeOf<FirstArg<string>>().toBeNever();
  });
});

describe("Last", () => {
  test("最后一个元素", () => {
    expectTypeOf<Last<["plan", "act", "observe"]>>().toEqualTypeOf<"observe">();
    expectTypeOf<Last<readonly [1]>>().toEqualTypeOf<1>();
  });

  test("空元组为 never", () => {
    expectTypeOf<Last<[]>>().toBeNever();
  });
});

describe("Unwrap", () => {
  test("拆开嵌套的 Promise", () => {
    expectTypeOf<Unwrap<Promise<Promise<number>>>>().toEqualTypeOf<number>();
  });

  test("不是 Promise 时原样返回", () => {
    expectTypeOf<Unwrap<string[]>>().toEqualTypeOf<string[]>();
  });
});

describe("ResultsOf", () => {
  test("同步和异步函数的返回值类型", () => {
    type Handlers = {
      get_weather: (args: { city: string }) => Promise<{ condition: string }>;
      add: (a: number, b: number) => number;
    };
    expectTypeOf<ResultsOf<Handlers>>().toEqualTypeOf<{
      get_weather: { condition: string };
      add: number;
    }>();
  });
});

const add = (a: number, b: number) => a + b;

describe("recorded", () => {
  test("fn 的签名和原函数相同", () => {
    expectTypeOf(recorded(add).fn).toEqualTypeOf<(a: number, b: number) => number>();
  });

  test("calls 是 CallRecord 数组", () => {
    expectTypeOf(recorded(add).calls).toEqualTypeOf<CallRecord<[a: number, b: number], number>[]>();
  });

  test("参数类型错误时报错", () => {
    // @ts-expect-error -- add 的参数是 number
    recorded(add).fn("1", 2);
  });
});

describe("withFallback", () => {
  test("签名和原函数相同", () => {
    const parse = (text: string): number => Number.parseInt(text, 10);
    expectTypeOf(withFallback(parse, 0)).toEqualTypeOf<(text: string) => number>();
  });

  test("fallback 类型不对时报错", () => {
    const parse = (text: string): number => Number.parseInt(text, 10);
    // @ts-expect-error -- fallback 必须是 number
    withFallback(parse, "0");
  });
});

describe("memoize", () => {
  test("签名和原函数相同", () => {
    const lookup = (city: string) => ({ city, condition: "晴" });
    expectTypeOf(memoize(lookup)).toEqualTypeOf<
      (arg: string) => { city: string; condition: string }
    >();
  });
});
