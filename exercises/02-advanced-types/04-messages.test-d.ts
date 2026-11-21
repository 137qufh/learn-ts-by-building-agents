import { describe, expectTypeOf, test } from "vitest";
import {
  deepFreeze,
  lastOfRole,
  ofRole,
  sumField,
  type DeepReadonly,
  type IsNever,
  type KeysOfType,
  type Message,
  type MessageOfRole,
} from "./04-messages.ts";

type ToolMessage = { role: "tool"; toolCallId: string; content: string; isError?: boolean };
type UserMessage = { role: "user"; content: string };

describe("MessageOfRole", () => {
  test("挑出一种消息", () => {
    expectTypeOf<MessageOfRole<"tool">>().toEqualTypeOf<ToolMessage>();
  });

  test("传入联合时得到联合", () => {
    expectTypeOf<MessageOfRole<"user" | "tool">>().toEqualTypeOf<UserMessage | ToolMessage>();
  });
});

describe("IsNever", () => {
  test("never 是 true", () => {
    expectTypeOf<IsNever<never>>().toEqualTypeOf<true>();
  });

  test("其他类型是 false", () => {
    expectTypeOf<IsNever<string>>().toEqualTypeOf<false>();
    expectTypeOf<IsNever<undefined>>().toEqualTypeOf<false>();
    expectTypeOf<IsNever<"a" | "b">>().toEqualTypeOf<false>();
  });
});

interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  done: boolean;
}

describe("KeysOfType", () => {
  test("值为 number 的键", () => {
    expectTypeOf<KeysOfType<Usage, number>>().toEqualTypeOf<"inputTokens" | "outputTokens">();
  });

  test("没有匹配的键时是 never", () => {
    expectTypeOf<KeysOfType<Usage, bigint>>().toBeNever();
  });

  test("可以按联合匹配", () => {
    expectTypeOf<KeysOfType<Usage, string | boolean>>().toEqualTypeOf<"model" | "done">();
  });
});

describe("DeepReadonly", () => {
  interface Config {
    model: { name: string; temperature: number };
    tools: { name: string }[];
    tags: string[];
    onEvent: (name: string) => void;
  }

  test("每一层都只读，函数保持原样", () => {
    expectTypeOf<DeepReadonly<Config>>().toEqualTypeOf<{
      readonly model: { readonly name: string; readonly temperature: number };
      readonly tools: readonly { readonly name: string }[];
      readonly tags: readonly string[];
      readonly onEvent: (name: string) => void;
    }>();
  });

  test("基本类型保持原样", () => {
    expectTypeOf<DeepReadonly<string>>().toEqualTypeOf<string>();
    expectTypeOf<DeepReadonly<number | null>>().toEqualTypeOf<number | null>();
  });
});

const history: Message[] = [];

describe("ofRole / lastOfRole", () => {
  test("返回精确的消息类型", () => {
    expectTypeOf(ofRole(history, "tool")).toEqualTypeOf<ToolMessage[]>();
    expectTypeOf(lastOfRole(history, "user")).toEqualTypeOf<UserMessage | undefined>();
  });

  test("不存在的角色报错", () => {
    // @ts-expect-error -- 没有 developer 角色
    ofRole(history, "developer");
  });
});

describe("sumField", () => {
  const usages: Usage[] = [];

  test("返回 number", () => {
    expectTypeOf(sumField(usages, "inputTokens")).toEqualTypeOf<number>();
  });

  test("值不是 number 的键报错", () => {
    // @ts-expect-error -- model 是 string
    sumField(usages, "model");
  });

  test("可选的数值字段也报错（值可能是 undefined）", () => {
    // @ts-expect-error -- cachedTokens 是 number | undefined
    sumField(usages, "cachedTokens");
  });
});

describe("deepFreeze", () => {
  test("返回 DeepReadonly<T>", () => {
    const config = { model: { name: "gpt-5" }, tags: ["a"] };
    expectTypeOf(deepFreeze(config)).toEqualTypeOf<DeepReadonly<typeof config>>();
  });

  test("冻结后不能修改", () => {
    const frozen = deepFreeze({ model: { name: "gpt-5" } });
    // @ts-expect-error -- 深层属性也是只读的
    frozen.model.name = "other";
  });
});
