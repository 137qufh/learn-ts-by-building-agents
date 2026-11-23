/**
 * 练习 5-5 参考答案：校验模型的输出
 */
import { z } from "zod";

export type ExtractResult = { ok: true; value: unknown } | { ok: false; error: string };

function tryParse(text: string): ExtractResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/** 从 start 处的 { 或 [ 开始，找到与它配对的结束括号，返回结束位置（不含）；找不到时返回 -1。 */
function matchBracket(text: string, start: number): number {
  const stack: string[] = [];
  let inString = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (char === "\\") {
        index++;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
    } else if (char === "}" || char === "]") {
      if (stack.pop() !== char) {
        return -1;
      }
      if (stack.length === 0) {
        return index + 1;
      }
    }
  }
  return -1;
}

export function extractJson(text: string): ExtractResult {
  const trimmed = text.trim();
  const whole = tryParse(trimmed);
  if (whole.ok) {
    return whole;
  }

  const fence = /```(?:json)?[ \t]*\r?\n([\s\S]*?)```/i.exec(text);
  if (fence?.[1] !== undefined) {
    return tryParse(fence[1].trim());
  }

  const start = text.search(/[{[]/);
  if (start === -1) {
    return { ok: false, error: "回答里没有 JSON" };
  }
  const end = matchBracket(text, start);
  if (end === -1) {
    return { ok: false, error: "JSON 不完整" };
  }
  return tryParse(text.slice(start, end));
}

export function formatPath(path: readonly PropertyKey[]): string {
  let result = "";
  for (const key of path) {
    result +=
      typeof key === "number" ? `[${key}]` : result === "" ? String(key) : `.${String(key)}`;
  }
  return result === "" ? "(根)" : result;
}

export function issuesForModel(error: z.ZodError): string {
  return error.issues.map((issue) => `- ${formatPath(issue.path)}: ${issue.message}`).join("\n");
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseToolArguments<S extends z.ZodType>(
  raw: string,
  schema: S,
): ParseResult<z.output<S>> {
  const json = tryParse(raw);
  if (!json.ok) {
    return { ok: false, error: `参数不是合法的 JSON：${json.error}` };
  }
  const result = schema.safeParse(json.value);
  if (!result.success) {
    return { ok: false, error: `参数不符合要求：\n${issuesForModel(result.error)}` };
  }
  return { ok: true, value: result.data };
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type Generate = (turns: readonly ChatTurn[]) => Promise<string>;

export interface GenerateOptions {
  maxAttempts?: number;
}

export type ValidatedResult<T> =
  { ok: true; value: T; attempts: number } | { ok: false; attempts: number; errors: string[] };

export function feedbackFor(problem: string): string {
  return `你的回答有问题：\n${problem}\n请只输出修正后的 JSON，不要有其他内容。`;
}

export async function generateValidated<S extends z.ZodType>(
  generate: Generate,
  prompt: string,
  schema: S,
  options: GenerateOptions = {},
): Promise<ValidatedResult<z.output<S>>> {
  const maxAttempts = options.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError(`maxAttempts 必须是正整数，收到 ${maxAttempts}`);
  }

  const turns: ChatTurn[] = [{ role: "user", content: prompt }];
  const errors: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const text = await generate([...turns]);
    const json = extractJson(text);
    let problem: string;
    if (json.ok) {
      const result = schema.safeParse(json.value);
      if (result.success) {
        return { ok: true, value: result.data, attempts: attempt };
      }
      problem = issuesForModel(result.error);
    } else {
      problem = `- 不是合法的 JSON：${json.error}`;
    }
    errors.push(problem);
    turns.push(
      { role: "assistant", content: text },
      { role: "user", content: feedbackFor(problem) },
    );
  }
  return { ok: false, attempts: maxAttempts, errors };
}
