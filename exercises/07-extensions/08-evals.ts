/**
 * 练习 7-8：确定性的评测
 *
 * 课程：chapters/07-extensions/08-evals.md
 * 运行：pnpm ex 08-evals
 *
 * runEval(cases) 按顺序跑每个用例，一个失败或抛错也不要停。
 * 抛错时这条的 reasons 是 [`运行抛出了错误：${message}`]，后面的用例继续。
 * 全部断言都过了才算 passed。一条用例可以同时有多条 reasons。
 *
 * 断言（有写才检查）：
 * - textEquals：完全相等。不等时 `文本不等于预期：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`
 * - textIncludes：每一段都要出现。缺了 `文本没有包含 ${JSON.stringify(那段)}`
 * - tools：工具名序列完全一致，包括顺序和次数。
 *   `工具序列不等于预期：期望 ${期望用逗号连接}，实际 ${实际用逗号连接}`
 * - toolsInclude：期望的名字按顺序出现，中间可以夹别的。空数组永远通过。
 *   `工具序列没有按顺序包含 ${用 " → " 连接}，实际 ${用逗号连接}`
 * - transcript：长度不同时 `记录长度不同：期望 N 步，实际 M 步`。
 *   某一步的 role、text、tools 任一不同：`记录第 ${下标} 步不符合预期`，下标从 0 开始。
 */
import { todo } from "../todo.ts";

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
  tools?: readonly string[];
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
  return todo("实现 runEval");
}
