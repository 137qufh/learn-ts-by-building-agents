/**
 * 练习 2-3：agent 状态
 *
 * 课程：chapters/02-advanced-types/03-mapped-types.md
 * 运行：pnpm ex 03-agent-state
 *
 * agent 运行时有一份不断变化的状态：现在在干什么、第几轮、还有哪些工具调用没完成……
 * 界面（命令行的进度提示、网页上的状态栏）需要在状态变化时得到通知。
 * 这道题用映射类型为任意状态对象写"比较表"和"变更监听"，再实现一个小小的状态仓库（store）。
 *
 * 需要你写签名的函数先用 any 占位；类型测试在 03-agent-state.test-d.ts。
 * 不允许在你的答案里使用 any。
 */
import { todo, type Todo } from "../todo.ts";

export interface AgentState {
  status: "idle" | "thinking" | "running_tool" | "done" | "error";
  turn: number;
  lastToolName?: string;
  readonly sessionId: string;
  pendingToolCalls: readonly string[];
}

/** 去掉所有属性的 readonly（? 保持不变）。 */
export type Mutable<T> = Todo;

/**
 * 每个属性一个比较函数，参数是那个属性的类型，返回"两个值是否相同"。
 * 所有比较函数都是必需的，即使原来的属性是可选的。
 */
export type Comparators<T> = Todo;

/**
 * 每个属性一个 **可选的** 监听函数：属性变化时以 (新值, 旧值) 调用，返回 void。
 */
export type ChangeHandlers<T> = Todo;

/**
 * 按 comparators 里键的顺序，返回 before 和 after 中不相同的键。
 *
 * comparators 必须为 T 的每个键提供比较函数，所以 T 新增字段时，
 * 所有调用 changedKeys 的地方都会提醒你补上。
 */
export function changedKeys(before: any, after: any, comparators: any): any {
  return todo("实现 changedKeys");
}

export interface Store<T> {
  /** 当前状态。 */
  get(): Readonly<T>;
  /** 修改一个属性。值没有变化（===）时什么也不做；变化了就调用对应的监听函数。 */
  set<K extends keyof T>(key: K, value: T[K]): void;
  /**
   * 一次修改多个属性：先把所有修改都应用上，再按 patch 中键的顺序，
   * 为值真正变化了的属性调用监听函数。这样监听函数里调用 get() 时，看到的已经是完整的新状态。
   */
  update(patch: Partial<T>): void;
}

/**
 * 创建一个状态仓库。initial 会被复制，之后修改 initial 不影响仓库。
 * handlers 可以省略。
 */
export function createStore(initial: any, handlers?: any): Store<any> {
  return todo("实现 createStore");
}
