/**
 * 练习 7-9：评判结果和回归
 *
 * 课程：chapters/07-extensions/09-judge.md
 * 运行：pnpm ex 09-judge
 *
 * parseJudge(text, criteria) 不抛异常。从文本里取出一个 JSON 对象
 * （可以包在 ```json 代码块里，也可以前后有别的字），解析 scores。
 * - 解析失败：{ ok: false, error: `无法解析评测结果：${message}` }
 * - 没有 scores 数组：error 是 "评测结果缺少 scores"
 * - 某一条不是带字符串 criterion 的对象：error 是 "scores 里有一条不是带 criterion 的对象"
 * - 同一个 criterion 出现两次：`评分项 "${name}" 重复了`
 * - score 不是整数 0、1 或 2（字符串 "2" 也不行）：`评分项 "${name}" 的分数必须是 0、1 或 2`
 * - reason 不是非空字符串：`评分项 "${name}" 缺少理由`
 * - 有量表里没有的项：`多余的评分项 ${用 JSON.stringify 后逗号加空格连接}`
 * - 缺了量表里的项：`缺少评分项 "${name}"`（按量表的顺序查，报第一个）
 * - 成功时 scores 按量表的顺序排，mean 是算术平均，不四舍五入。
 *
 * compareBaseline(current, baseline, tolerance = 0)：
 * - tolerance 不是非负有限数字，或者任一 mean 不是有限数字，或者名字重复，都抛异常。
 *   tolerance 用 RangeError，重复名字用 Error，消息里包含那个名字。
 * - 下降超过 tolerance（before - after > tolerance）记一条回归：
 *   { name, before, after, delta }，delta 是 after - before。
 * - 基线里有、这次没有的名字放进 missing，按基线的顺序。这次多出来的名字不算问题。
 * - 没有回归也没有缺失：{ ok: true }。否则 { ok: false, regressions, missing }。
 */
import { todo } from "../todo.ts";

export interface RubricScore {
  criterion: string;
  score: number;
  reason: string;
}

export type JudgeResult =
  { ok: true; scores: RubricScore[]; mean: number } | { ok: false; error: string };

export function parseJudge(text: string, criteria: readonly string[]): JudgeResult {
  return todo("实现 parseJudge");
}

export interface ScorePoint {
  name: string;
  mean: number;
}

export interface Regression {
  name: string;
  before: number;
  after: number;
  delta: number;
}

export type BaselineComparison =
  { ok: true } | { ok: false; regressions: Regression[]; missing: string[] };

export function compareBaseline(
  current: readonly ScorePoint[],
  baseline: readonly ScorePoint[],
  tolerance?: number,
): BaselineComparison {
  return todo("实现 compareBaseline");
}
