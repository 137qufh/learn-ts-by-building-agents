import { describe, expectTypeOf, test } from "vitest";
import {
  changedKeys,
  createStore,
  type AgentState,
  type ChangeHandlers,
  type Comparators,
  type Mutable,
  type Store,
} from "./03-agent-state.ts";

interface Config {
  readonly model: string;
  retries?: number;
}

describe("Mutable", () => {
  test("去掉 readonly，保留 ?", () => {
    expectTypeOf<Mutable<Config>>().toEqualTypeOf<{ model: string; retries?: number }>();
  });
});

describe("Comparators", () => {
  test("每个键一个必需的比较函数", () => {
    expectTypeOf<Comparators<Config>>().toEqualTypeOf<{
      readonly model: (a: string, b: string) => boolean;
      retries: (a: number | undefined, b: number | undefined) => boolean;
    }>();
  });
});

describe("ChangeHandlers", () => {
  test("每个键一个可选的监听函数", () => {
    expectTypeOf<ChangeHandlers<Config>>().toEqualTypeOf<{
      readonly model?: (next: string, prev: string) => void;
      retries?: (next: number | undefined, prev: number | undefined) => void;
    }>();
  });
});

const initial: AgentState = {
  status: "idle",
  turn: 0,
  sessionId: "sess_1",
  pendingToolCalls: [],
};
const same = <V>(a: V, b: V) => a === b;

describe("changedKeys", () => {
  test("返回 (keyof T)[]", () => {
    const keys = changedKeys(
      { a: 1, b: "x" },
      { a: 2, b: "x" },
      { a: (x, y) => x === y, b: (x, y) => x === y },
    );
    expectTypeOf(keys).toEqualTypeOf<("a" | "b")[]>();
  });

  test("比较函数的参数类型来自对应的字段", () => {
    changedKeys(
      { a: 1, b: "x" },
      { a: 2, b: "x" },
      {
        a: (x, y) => {
          expectTypeOf(x).toEqualTypeOf<number>();
          return x === y;
        },
        b: same,
      },
    );
  });

  test("漏掉比较函数时报错", () => {
    // @ts-expect-error -- 缺少 pendingToolCalls 的比较函数
    changedKeys(initial, initial, {
      status: same,
      turn: same,
      lastToolName: same,
      sessionId: same,
    });
  });
});

describe("createStore", () => {
  test("返回 Store<T>", () => {
    expectTypeOf(createStore(initial)).toEqualTypeOf<Store<AgentState>>();
  });

  test("监听函数的参数类型来自对应的字段", () => {
    createStore(initial, {
      status: (next, prev) => {
        expectTypeOf(next).toEqualTypeOf<AgentState["status"]>();
        expectTypeOf(prev).toEqualTypeOf<AgentState["status"]>();
      },
    });
  });

  test("set 的值必须和键对应", () => {
    const store = createStore(initial);
    // @ts-expect-error -- turn 是 number
    store.set("turn", "1");
  });

  test("不认识的监听函数报错", () => {
    // @ts-expect-error -- AgentState 没有 state 字段
    createStore(initial, { state: () => {} });
  });
});
