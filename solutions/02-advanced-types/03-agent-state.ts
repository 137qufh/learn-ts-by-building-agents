/**
 * 练习 2-3 参考答案：agent 状态
 */

export interface AgentState {
  status: "idle" | "thinking" | "running_tool" | "done" | "error";
  turn: number;
  lastToolName?: string;
  readonly sessionId: string;
  pendingToolCalls: readonly string[];
}

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// -? 去掉可选：每个字段都必须有比较函数。
// 注意可选属性的 T[K] 里含有 undefined（retries?: number 的 T[K] 是 number | undefined），
// 这正是我们想要的：比较函数需要能处理"没有值"的情况。
export type Comparators<T> = { [K in keyof T]-?: (a: T[K], b: T[K]) => boolean };

export type ChangeHandlers<T> = { [K in keyof T]?: (next: T[K], prev: T[K]) => void };

export function changedKeys<T>(before: T, after: T, comparators: Comparators<T>): (keyof T)[] {
  // Object.keys 返回 string[]（见 2.2 节）。这里的断言是有根据的：comparators 的类型保证了
  // 它至少有 T 的每个键；即使运行时有多余的键，我们也只是多比较了一个属性，而不会读到错误的类型。
  const keys = Object.keys(comparators) as (keyof T)[];
  return keys.filter((key) => !comparators[key](before[key], after[key]));
}

export interface Store<T> {
  get(): Readonly<T>;
  set<K extends keyof T>(key: K, value: T[K]): void;
  update(patch: Partial<T>): void;
}

export function createStore<T extends object>(
  initial: T,
  handlers: ChangeHandlers<T> = {},
): Store<T> {
  let state: T = { ...initial };

  // 把"调用某个键的监听函数"单独写成泛型函数，让 K 把新值、旧值和监听函数的类型串起来。
  function notify<K extends keyof T>(key: K, next: T[K], prev: T[K]): void {
    handlers[key]?.(next, prev);
  }

  return {
    get: () => state,

    set(key, value) {
      const prev = state[key];
      if (prev === value) {
        return;
      }
      state = { ...state, [key]: value };
      notify(key, value, prev);
    },

    update(patch) {
      const prevState = state;
      state = { ...state, ...patch };
      // patch 是 Partial<T>，在 exactOptionalPropertyTypes 下它的键要么不存在，要么有值
      for (const key of Object.keys(patch) as (keyof T)[]) {
        if (prevState[key] !== state[key]) {
          notify(key, state[key], prevState[key]);
        }
      }
    },
  };
}
