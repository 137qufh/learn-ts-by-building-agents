import { describe, expect, test } from "vitest";
import { changedKeys, createStore, type AgentState } from "./03-agent-state.ts";

const initial: AgentState = {
  status: "idle",
  turn: 0,
  sessionId: "sess_1",
  pendingToolCalls: [],
};

const sameArray = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((item, i) => item === b[i]);

const comparators = {
  status: (a: unknown, b: unknown) => a === b,
  turn: (a: unknown, b: unknown) => a === b,
  lastToolName: (a: unknown, b: unknown) => a === b,
  sessionId: (a: unknown, b: unknown) => a === b,
  pendingToolCalls: sameArray,
};

describe("changedKeys", () => {
  test("没有变化时返回空数组", () => {
    expect(changedKeys(initial, { ...initial }, comparators)).toStrictEqual([]);
  });

  test("用每个字段自己的比较函数", () => {
    const after: AgentState = {
      ...initial,
      turn: 1,
      pendingToolCalls: [], // 新数组，但内容相同
    };
    expect(changedKeys(initial, after, comparators)).toStrictEqual(["turn"]);
  });

  test("按 comparators 的键顺序返回", () => {
    const after: AgentState = {
      ...initial,
      pendingToolCalls: ["call_1"],
      status: "running_tool",
      lastToolName: "search",
    };
    expect(changedKeys(initial, after, comparators)).toStrictEqual([
      "status",
      "lastToolName",
      "pendingToolCalls",
    ]);
  });
});

describe("createStore", () => {
  test("get 返回当前状态", () => {
    const store = createStore(initial);
    expect(store.get()).toStrictEqual(initial);
  });

  test("复制 initial", () => {
    const source = { ...initial };
    const store = createStore(source);
    source.turn = 99;
    expect(store.get().turn).toBe(0);
  });

  test("set 修改属性并调用对应的监听函数", () => {
    const calls: unknown[] = [];
    const store = createStore(initial, {
      status: (next: unknown, prev: unknown) => calls.push(["status", next, prev]),
      turn: (next: unknown, prev: unknown) => calls.push(["turn", next, prev]),
    });
    store.set("status", "thinking");
    expect(store.get().status).toBe("thinking");
    expect(calls).toStrictEqual([["status", "thinking", "idle"]]);
  });

  test("值没有变化时不调用监听函数", () => {
    let count = 0;
    const store = createStore(initial, { turn: () => count++ });
    store.set("turn", 0);
    expect(count).toBe(0);
    store.set("turn", 1);
    expect(count).toBe(1);
  });

  test("没有监听函数的属性也能修改", () => {
    const store = createStore(initial, {});
    store.set("lastToolName", "search");
    expect(store.get().lastToolName).toBe("search");
  });

  test("update 先应用全部修改，再按顺序调用监听函数", () => {
    const seen: unknown[] = [];
    const store = createStore(initial, {
      status: () => seen.push(["status", store.get().turn]),
      turn: () => seen.push(["turn", store.get().status]),
    });
    store.update({ turn: 1, status: "thinking", sessionId: "sess_1" });
    expect(store.get()).toStrictEqual({ ...initial, turn: 1, status: "thinking" });
    // turn 在 patch 里排在前面，所以先调用；调用时 status 已经是新值了
    expect(seen).toStrictEqual([
      ["turn", "thinking"],
      ["status", 1],
    ]);
  });
});
