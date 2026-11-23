/**
 * 练习 7-8 参考答案：确定性的评测。一个用例抛错，后面的用例仍然要跑。
 */
export interface TranscriptTurn {
  role: string;
  text: string;
  tools: readonly string[];
}

export interface EvalOutcome {
  text: string;
  tools: readonly string[];
  transcript: readonly TranscriptTurn[];
}

export interface EvalExpect {
  textEquals?: string;
  textIncludes?: readonly string[];
  /** 工具名的完整序列，顺序和次数都要一致 */
  tools?: readonly string[];
  /** 按顺序出现即可，中间可以夹别的工具 */
  toolsInclude?: readonly string[];
  transcript?: readonly TranscriptTurn[];
}

export interface EvalCase {
  name: string;
  run(): Promise<EvalOutcome>;
  expect: EvalExpect;
}

export interface EvalFailure {
  name: string;
  reasons: string[];
}

export interface EvalReport {
  passed: number;
  failed: EvalFailure[];
}

export async function runEval(cases: readonly EvalCase[]): Promise<EvalReport> {
  const failed: EvalFailure[] = [];
  let passed = 0;
  for (const item of cases) {
    let outcome: EvalOutcome;
    try {
      outcome = await item.run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ name: item.name, reasons: [`运行抛出了错误：${message}`] });
      continue;
    }
    const reasons = reasonsFor(item.expect, outcome);
    if (reasons.length === 0) passed++;
    else failed.push({ name: item.name, reasons });
  }
  return { passed, failed };
}

function reasonsFor(expect: EvalExpect, outcome: EvalOutcome): string[] {
  const reasons: string[] = [];
  if (expect.textEquals !== undefined && outcome.text !== expect.textEquals) {
    reasons.push(
      `文本不等于预期：期望 ${JSON.stringify(expect.textEquals)}，实际 ${JSON.stringify(outcome.text)}`,
    );
  }
  for (const piece of expect.textIncludes ?? []) {
    if (!outcome.text.includes(piece)) {
      reasons.push(`文本没有包含 ${JSON.stringify(piece)}`);
    }
  }
  if (expect.tools !== undefined && !sameSequence(outcome.tools, expect.tools)) {
    reasons.push(
      `工具序列不等于预期：期望 ${expect.tools.join(",")}，实际 ${outcome.tools.join(",")}`,
    );
  }
  if (expect.toolsInclude !== undefined && !isSubsequence(outcome.tools, expect.toolsInclude)) {
    reasons.push(
      `工具序列没有按顺序包含 ${expect.toolsInclude.join(" → ")}，实际 ${outcome.tools.join(",")}`,
    );
  }
  if (expect.transcript !== undefined) {
    const diff = transcriptDiff(outcome.transcript, expect.transcript);
    if (diff !== undefined) reasons.push(diff);
  }
  return reasons;
}

function sameSequence(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length && actual.every((name, index) => name === expected[index])
  );
}

function isSubsequence(actual: readonly string[], expected: readonly string[]): boolean {
  let cursor = 0;
  for (const name of actual) {
    if (name === expected[cursor]) cursor++;
    if (cursor === expected.length) return true;
  }
  return cursor === expected.length;
}

function transcriptDiff(
  actual: readonly TranscriptTurn[],
  expected: readonly TranscriptTurn[],
): string | undefined {
  if (actual.length !== expected.length) {
    return `记录长度不同：期望 ${expected.length} 步，实际 ${actual.length} 步`;
  }
  for (let index = 0; index < actual.length; index++) {
    const left = actual[index];
    const right = expected[index];
    if (left === undefined || right === undefined || !sameTurn(left, right)) {
      return `记录第 ${index} 步不符合预期`;
    }
  }
  return undefined;
}

function sameTurn(actual: TranscriptTurn, expected: TranscriptTurn): boolean {
  return (
    actual.role === expected.role &&
    actual.text === expected.text &&
    sameSequence(actual.tools, expected.tools)
  );
}
