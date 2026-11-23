/**
 * 确定性的评测，以及带量表的评判和回归比较（第 7 章）。
 *
 * runEval 不调用模型。parseJudge 只解析别人给的文本：那个"别人"可以是假的，也可以是模型。
 * 比较的是分数有没有下降，不是"模型觉得好不好"本身。
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

export interface RubricScore {
  criterion: string;
  score: number;
  reason: string;
}

export type JudgeResult =
  { ok: true; scores: RubricScore[]; mean: number } | { ok: false; error: string };

export function parseJudge(text: string, criteria: readonly string[]): JudgeResult {
  let value: unknown;
  try {
    value = extractJson(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `无法解析评测结果：${message}` };
  }
  if (!isRecord(value) || !Array.isArray(value["scores"])) {
    return { ok: false, error: "评测结果缺少 scores" };
  }
  const rows = value["scores"];
  const byName = new Map<string, RubricScore>();
  for (const row of rows) {
    if (!isRecord(row) || typeof row["criterion"] !== "string") {
      return { ok: false, error: "scores 里有一条不是带 criterion 的对象" };
    }
    const criterion = row["criterion"];
    if (byName.has(criterion)) {
      return { ok: false, error: `评分项 "${criterion}" 重复了` };
    }
    const score = row["score"];
    if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 2) {
      return { ok: false, error: `评分项 "${criterion}" 的分数必须是 0、1 或 2` };
    }
    const reason = row["reason"];
    if (typeof reason !== "string" || reason.trim() === "") {
      return { ok: false, error: `评分项 "${criterion}" 缺少理由` };
    }
    byName.set(criterion, { criterion, score, reason });
  }
  const extras = [...byName.keys()].filter((name) => !criteria.includes(name));
  if (extras.length > 0) {
    return {
      ok: false,
      error: `多余的评分项 ${extras.map((name) => JSON.stringify(name)).join(", ")}`,
    };
  }
  const scores: RubricScore[] = [];
  for (const criterion of criteria) {
    const score = byName.get(criterion);
    if (score === undefined) {
      return { ok: false, error: `缺少评分项 "${criterion}"` };
    }
    scores.push(score);
  }
  const mean = scores.reduce((sum, score) => sum + score.score, 0) / scores.length;
  return { ok: true, scores, mean };
}

export interface ScorePoint {
  name: string;
  mean: number;
}

export interface Regression {
  name: string;
  before: number;
  after: number;
  /** after - before。负数表示下降。 */
  delta: number;
}

export type BaselineComparison =
  { ok: true } | { ok: false; regressions: Regression[]; missing: string[] };

export function compareBaseline(
  current: readonly ScorePoint[],
  baseline: readonly ScorePoint[],
  tolerance = 0,
): BaselineComparison {
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError(`tolerance 必须是非负的有限数字，收到的是 ${tolerance}`);
  }
  const currentByName = indexScores(current, "current");
  const baselineByName = indexScores(baseline, "baseline");
  const regressions: Regression[] = [];
  for (const point of current) {
    const before = baselineByName.get(point.name);
    if (before === undefined) continue;
    const delta = point.mean - before;
    if (before - point.mean > tolerance) {
      regressions.push({ name: point.name, before, after: point.mean, delta });
    }
  }
  const missing = baseline.filter((item) => !currentByName.has(item.name)).map((item) => item.name);
  if (regressions.length === 0 && missing.length === 0) return { ok: true };
  return { ok: false, regressions, missing };
}

function indexScores(points: readonly ScorePoint[], label: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const point of points) {
    if (!Number.isFinite(point.mean)) {
      throw new RangeError(`${label} 里 "${point.name}" 的 mean 不是有限数字`);
    }
    if (map.has(point.name)) {
      throw new Error(`${label} 里的名字 "${point.name}" 重复了`);
    }
    map.set(point.name, point.mean);
  }
  return map;
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("找不到 JSON 对象");
  }
  return JSON.parse(source.slice(start, end + 1)) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
