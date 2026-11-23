/**
 * 练习 5-5：校验模型的输出
 *
 * 课程：chapters/05-validation/05-model-output.md
 * 运行：pnpm ex 05-repair-loop
 *
 * 模型的输出是一段文本。要把它变成可信的数据：先找出 JSON，再用 schema 校验，
 * 不合格时把问题告诉模型，让它改正。
 *
 * 1. extractJson(text)：从模型的回答里取出 JSON，依次尝试：
 *    a. 去掉首尾空白后，整段就是 JSON
 *    b. 第一个 Markdown 代码块（```json 或 ```，json 不区分大小写，换行，内容，```）里的内容
 *       —— 找到了代码块就只用它，解析失败就返回失败
 *    c. 从第一个 { 或 [ 开始，到与它配对的 } 或 ] 为止的那一段
 *       —— 配对时要跳过字符串里的括号（字符串里还可能有 \" 这样的转义）
 *       —— 括号不配对（比如 [ 遇到 }）或者到结尾都没配上，返回 { ok: false, error: "JSON 不完整" }
 *    都没有 { 或 [ 时，返回 { ok: false, error: "回答里没有 JSON" }
 *    JSON.parse 失败时，error 是 JSON.parse 抛出的错误的 message
 *
 * 2. formatPath(path)：把 Zod 问题的 path 写成 JS 的写法
 *    []                         → "(根)"
 *    ["steps", 0, "output"]     → "steps[0].output"
 *    [0, "content"]             → "[0].content"
 *
 * 3. issuesForModel(error)：每个问题一行，`- ${formatPath(path)}: ${message}`
 *
 * 4. parseToolArguments(raw, schema)：解析模型给出的工具参数（一段 JSON 字符串）
 *    - 不是合法的 JSON：error 是 `参数不是合法的 JSON：${JSON.parse 的错误信息}`
 *    - 不符合 schema：error 是 `参数不符合要求：\n${issuesForModel(...)}`
 *    - 成功时 value 是 schema 的输出（经过转换和默认值）
 *
 * 5. generateValidated(generate, prompt, schema, options)：生成 → 校验 → 反馈 的循环
 *    - 对话从 [{ role: "user", content: prompt }] 开始，每次调用 generate 时传入对话到目前为止的副本
 *    - 回答通过 extractJson 和 schema 的校验：返回 { ok: true, value, attempts }（attempts 是第几次成功的）
 *    - 不通过：问题描述是 issuesForModel(...) 的结果，或者 `- 不是合法的 JSON：${extractJson 的 error}`；
 *      把它记进 errors，然后在对话末尾追加两条：
 *        { role: "assistant", content: 模型的原始回答 }
 *        { role: "user", content: feedbackFor(问题描述) }
 *    - 最多尝试 maxAttempts 次（默认 3）；用完了返回 { ok: false, attempts: maxAttempts, errors }
 *    - maxAttempts 不是正整数时抛出 RangeError
 *    - generate 本身抛出的错误（网络错误等）不处理，直接传出去
 */
import { z } from "zod";
import { todo } from "../todo.ts";

export type ExtractResult = { ok: true; value: unknown } | { ok: false; error: string };

export function extractJson(text: string): ExtractResult {
  return todo("实现 extractJson");
}

export function formatPath(path: readonly PropertyKey[]): string {
  return todo("实现 formatPath");
}

export function issuesForModel(error: z.ZodError): string {
  return todo("实现 issuesForModel");
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseToolArguments<S extends z.ZodType>(
  raw: string,
  schema: S,
): ParseResult<z.output<S>> {
  return todo("实现 parseToolArguments");
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** 调用一次模型：传入对话，返回模型的回答文本。 */
export type Generate = (turns: readonly ChatTurn[]) => Promise<string>;

export interface GenerateOptions {
  maxAttempts?: number;
}

export type ValidatedResult<T> =
  { ok: true; value: T; attempts: number } | { ok: false; attempts: number; errors: string[] };

/** 已给出：回答不合格时发给模型的反馈。 */
export function feedbackFor(problem: string): string {
  return `你的回答有问题：\n${problem}\n请只输出修正后的 JSON，不要有其他内容。`;
}

export async function generateValidated<S extends z.ZodType>(
  generate: Generate,
  prompt: string,
  schema: S,
  options: GenerateOptions = {},
): Promise<ValidatedResult<z.output<S>>> {
  return todo("实现 generateValidated");
}
