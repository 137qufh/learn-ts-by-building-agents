/**
 * 练习 4-7：工作区的构建顺序
 *
 * 课程：chapters/04-tooling/07-monorepo.md
 * 运行：pnpm ex 07-build-order
 *
 * pnpm -r build 会按依赖关系排好顺序：被依赖的包先构建。pnpm --filter "...[origin/main]"
 * 只构建改动过的包和依赖它们的包。这道题实现这两件事背后的算法。
 */
import { todo } from "../todo.ts";

export interface WorkspacePackage {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** 依赖关系里有环 */
export class CycleError extends Error {
  override name = "CycleError";
  /** 环上的包，首尾相同，比如 ["a", "b", "c", "a"] */
  readonly cycle: string[];
  constructor(cycle: string[]) {
    super(`依赖关系里有环：${cycle.join(" → ")}`);
    this.cycle = cycle;
  }
}

/**
 * 找出每个包依赖的 **工作区内** 的包。
 *
 * - dependencies 和 devDependencies 都算
 * - 只有版本写成 "workspace:" 开头（比如 "workspace:*"、"workspace:^"）的才是工作区依赖，其余是 npm 上的包，忽略
 * - 工作区依赖指向一个不存在的包：抛出 Error，message 是 `${包名} 依赖的 ${依赖名} 不在工作区里`
 * - 包名重复：抛出 Error，message 是 `包名重复：${包名}`
 *
 * 返回 Map：包名 → 它依赖的工作区包名（按名字排序），Map 的顺序和 packages 一致。
 */
export function internalDependencies(packages: readonly WorkspacePackage[]): Map<string, string[]> {
  return todo("实现 internalDependencies");
}

/**
 * 把构建顺序分成若干"批"：同一批里的包互不依赖，可以并行构建（pnpm 默认就会并行）。
 *
 * - 第一批：不依赖任何工作区包的包
 * - 第 n 批：依赖都在前 n-1 批里、自己还没被排进去的包
 * - 每一批内部按名字排序（字符串比较）
 *
 * 有环时（某一步找不到可以排的包，但还有包没排）抛出 CycleError。cycle 是剩下的包里的一个环，
 * 从环上名字最小的包开始，首尾相同：比如 a 依赖 b、b 依赖 c、c 依赖 a，cycle 就是 ["a", "b", "c", "a"]。
 *
 * 提示：剩下的每个包都至少有一个依赖还没排进去。从名字最小的那个出发，每次走到"还没排进去的依赖"
 * 里名字最小的那个，一直走下去，一定会走回到路径上的某个包，这一段就是一个环。
 */
export function buildLevels(packages: readonly WorkspacePackage[]): string[][] {
  return todo("实现 buildLevels");
}

/**
 * 构建顺序：把 buildLevels 的各批按顺序拼起来。每个包都排在它依赖的所有包之后。
 */
export function buildOrder(packages: readonly WorkspacePackage[]): string[] {
  return todo("实现 buildOrder");
}

/**
 * 改动了 changed 里的包之后，哪些包需要重新构建和测试：改动的包本身，加上直接或间接依赖它们的包。
 * 结果按 buildOrder 的顺序排列。changed 里不在工作区的名字忽略。
 */
export function affected(
  packages: readonly WorkspacePackage[],
  changed: readonly string[],
): string[] {
  return todo("实现 affected");
}
