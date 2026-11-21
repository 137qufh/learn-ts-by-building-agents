/**
 * 练习 4-5：让 ESLint 帮你找 bug
 *
 * 课程：chapters/04-tooling/05-linting.md
 * 运行：pnpm ex 05-lint-fixes
 *
 * 这个文件能通过 tsc 的类型检查，看上去也没什么问题，但里面藏着 6 个 bug。
 * 每个 bug 都会被一条类型感知的 ESLint 规则发现。你的任务：
 *
 * 1. 运行 `pnpm exec eslint --no-ignore exercises/04-tooling/05-lint-fixes.ts`，看 ESLint 报了什么
 *    （exercises/ 目录平时被 lint 忽略了，因为没做完的练习里到处是未使用的参数，所以要加 --no-ignore）
 * 2. 弄明白每条报告背后的 bug，然后 **修好它**：改代码，而不是加一条禁用规则的注释让它闭嘴
 * 3. 测试会检查两件事：ESLint 没有任何报告；每个函数的行为符合注释里的说明
 *
 * 每个函数的注释描述的是"应该"的行为，代码是"现在"的行为。
 */

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "tool_result"; name: string; ok: boolean }
  | { type: "done" };

/**
 * 把事件变成一行日志：
 * - text：文字本身
 * - tool_call：`调用 ${name}(${args 的 JSON})`，比如 `调用 search({"q":"ts"})`
 * - tool_result：`${name} 成功` 或 `${name} 失败`
 * - done：`完成`
 */
export function describeEvent(event: AgentEvent): string {
  let line = "";
  switch (event.type) {
    case "text":
      line = event.text;
      break;
    case "tool_call":
      line = `调用 ${event.call.name}(${event.call.args})`;
      break;
    case "done":
      line = "完成";
      break;
  }
  return line;
}

export interface Policy {
  isAllowed(tool: string): Promise<boolean>;
}

/** 返回 policy 允许使用的工具，保持原来的顺序 */
export async function filterAllowed(tools: readonly string[], policy: Policy): Promise<string[]> {
  const allowed: string[] = [];
  tools.forEach(async (tool) => {
    if (await policy.isAllowed(tool)) {
      allowed.push(tool);
    }
  });
  return allowed;
}

export interface TranscriptStore {
  save(lines: readonly string[]): Promise<void>;
}

/**
 * 一轮对话结束时，把这一轮的内容存起来，返回保存的行数。
 * 返回的 Promise 完成时，内容必须已经保存好了；保存失败时，返回的 Promise 也要失败。
 */
export async function finishTurn(
  lines: readonly string[],
  store: TranscriptStore,
): Promise<number> {
  store.save([...lines]);
  return lines.length;
}

/**
 * 给 promise 加上超时：ms 毫秒内没有结果，就以 Error（message 是 `超时：${ms}ms`）拒绝。
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(`超时：${ms}ms`), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * 解析模型返回的工具调用 JSON，比如 `{"name":"search","args":{"q":"ts"}}`。
 * - name 必须是非空字符串
 * - args 可以省略（当作 {}）；写了的话必须是对象（不能是数组或 null）
 * 不符合要求（包括 JSON 本身不合法）时，抛出 Error，message 是 `工具调用格式不对`。
 */
export function parseToolCall(text: string): ToolCall {
  const data = JSON.parse(text);
  return { name: data.name, args: data.args ?? {} };
}
