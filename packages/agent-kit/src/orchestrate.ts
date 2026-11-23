/**
 * 编排：委托把结果交还编排者，交接把控制权交出去（第 7 章）。
 */
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
  /** 最多向 route 询问几次，默认 4 */
  maxSteps?: number;
  signal?: AbortSignal;
}

export interface OrchestrateResult {
  text: string;
  notes: readonly string[];
  steps: number;
  /** 发生交接时是接手的专家名字。委托不会设置它。 */
  handoff?: string;
}

export async function orchestrate(options: OrchestrateOptions): Promise<OrchestrateResult> {
  const { specialists, signal } = options;
  const maxSteps = options.maxSteps ?? 4;
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new RangeError(`maxSteps 必须是正整数，收到的是 ${maxSteps}`);
  }
  const byName = new Map(specialists.map((specialist) => [specialist.name, specialist]));
  const notes: string[] = [];

  for (let step = 1; step <= maxSteps; step++) {
    signal?.throwIfAborted();
    const decision = await options.route({ step, notes: [...notes] });
    if (decision.type === "final") {
      return { text: decision.text, notes: [...notes], steps: step };
    }
    const specialist = byName.get(decision.specialist);
    if (specialist === undefined) {
      throw new Error(`未知的专家 "${decision.specialist}"`);
    }
    // 每个专家拿到一份冻结的副本：改自己的那份，影响不到下一个专家，也影响不到编排者。
    const context = Object.freeze({ ...options.context });
    const text =
      signal === undefined
        ? await specialist.run(decision.task, context)
        : await specialist.run(decision.task, context, signal);
    if (decision.type === "handoff") {
      return { text, notes: [...notes], steps: step, handoff: specialist.name };
    }
    notes.push(`${specialist.name}：${text}`);
  }

  return {
    text: `编排在 ${maxSteps} 步后停止，还没有最终回答`,
    notes: [...notes],
    steps: maxSteps,
  };
}
