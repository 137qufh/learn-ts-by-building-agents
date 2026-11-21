// 一个有类型的小库：事件名和事件数据的对应关系写在 Events 接口里。
// Events 故意是空的，由使用者通过"模块扩充"往里面添加事件（见 04-declaration-files.ts）。

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- 就是要留给使用者扩充
export interface Events {}

type Listener<K extends keyof Events> = (payload: Events[K]) => void;
const listeners = new Map<keyof Events, Listener<never>[]>();

export function on<K extends keyof Events>(name: K, listener: Listener<K>): void {
  listeners.set(name, [...(listeners.get(name) ?? []), listener]);
}

export function emit<K extends keyof Events>(name: K, payload: Events[K]): void {
  for (const listener of listeners.get(name) ?? []) {
    (listener as Listener<K>)(payload);
  }
}
