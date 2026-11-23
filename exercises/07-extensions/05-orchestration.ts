/**
 * 练习 7-5：交接、编排，以及安全地共享上下文
 *
 * 课程：chapters/07-extensions/05-orchestration.md
 * 运行：pnpm ex 05-orchestration
 *
 * shareContext(facts, policy)：
 * - 只保留 policy.allow 里的键，顺序跟 allow 一样，重复的键只留第一次。
 * - 键名大小写敏感：allow 里写 "note"，facts 里只有 "Note"，就是没有。
 * - 值不是字符串的丢掉，不要 String() 转换。
 * - isSecretKey(key) 为 true 的键丢掉，即使它在 allow 里（apiKey、access_token 是，inputTokens 不是）。
 * - policy.deny 里的键也丢掉，这一项大小写不敏感。
 * - 返回新对象。之后改 facts 或改返回值，都不影响对方。
 *
 * orchestrate(options)：
 * - maxSteps 默认 4，不是正整数就抛 RangeError。
 * - 每一步先看 signal，已经中止就 throwIfAborted。然后调用 route({ step, notes })。
 *   step 从 1 开始。传给 route 的 notes 是副本。
 * - final：返回它的 text，steps 是当前步数，没有 handoff。
 * - delegate：找到专家，把 context 的冻结副本交给它（专家改这份会抛错），
 *   把 `${name}：${text}` 追加进 notes，继续。
 * - handoff：同样调用专家，然后立刻返回。text 是专家的回复，handoff 是它的名字。
 *   这次的回复不要写进 notes。
 * - 没有这个专家：抛出 Error，消息包含名字。
 * - 步数用尽仍没有 final 或 handoff：text 是 `编排在 ${maxSteps} 步后停止，还没有最终回答`，
 *   steps 是 maxSteps。
 * - 有 signal 时传给专家的 run；没有就不传第三参。
 */
import { todo } from "../todo.ts";

export interface SharePolicy {
  allow: readonly string[];
  deny?: readonly string[];
}

export function shareContext(
  facts: Readonly<Record<string, unknown>>,
  policy: SharePolicy,
): Record<string, string> {
  return todo("实现 shareContext");
}

export type RouteDecision =
  | { type: "final"; text: string }
  | { type: "delegate"; specialist: string; task: string }
  | { type: "handoff"; specialist: string; task: string };

export interface Specialist {
  name: string;
  run(
    task: string,
    context: Readonly<Record<string, string>>,
    signal?: AbortSignal,
  ): Promise<string>;
}

export interface OrchestratorState {
  step: number;
  notes: readonly string[];
}

export interface OrchestrateOptions {
  specialists: readonly Specialist[];
  context: Readonly<Record<string, string>>;
  route(state: OrchestratorState): RouteDecision | Promise<RouteDecision>;
  maxSteps?: number;
  signal?: AbortSignal;
}

export interface OrchestrateResult {
  text: string;
  notes: readonly string[];
  steps: number;
  handoff?: string;
}

export async function orchestrate(options: OrchestrateOptions): Promise<OrchestrateResult> {
  return todo("实现 orchestrate");
}
