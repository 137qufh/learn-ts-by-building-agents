/**
 * 练习 7-9 参考答案：解析评判结果，并和基线比有没有退步。
 * 分数必须是整数 0、1、2，不要把字符串 "2" 收成数字。
 */
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
