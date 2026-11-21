/**
 * 练习 3-3 参考答案：执行工具调用
 */

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export type Executor = (call: ToolCall) => Promise<string>;

export type ToolResult =
  { id: string; ok: true; output: string } | { id: string; ok: false; error: string };

// 把"可能拒绝的 Promise"变成"永远兑现、结果里记录成败"的 Promise。
// 两种执行方式的区别只在于"什么时候调用它"，错误处理只写这一次。
async function runOne(call: ToolCall, execute: Executor): Promise<ToolResult> {
  try {
    // 这里必须写 await：直接 return execute(call) 的话，拒绝会逃出 try（3.3 节）
    const output = await execute(call);
    return { id: call.id, ok: true, output };
  } catch (error) {
    return {
      id: call.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runSequentially(
  calls: readonly ToolCall[],
  execute: Executor,
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (const call of calls) {
    results.push(await runOne(call, execute)); // 循环里 await：上一个完成才开始下一个
  }
  return results;
}

export async function runConcurrently(
  calls: readonly ToolCall[],
  execute: Executor,
): Promise<ToolResult[]> {
  // map 立刻调用了每个 runOne，所有调用同时开始；runOne 永远不会拒绝，所以 Promise.all 也不会
  return Promise.all(calls.map((call) => runOne(call, execute)));
}

export async function firstSuccessful<T>(attempts: readonly (() => Promise<T>)[]): Promise<T> {
  const errors: unknown[] = [];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      errors.push(error);
    }
  }
  throw new AggregateError(errors, "全部失败");
}

export async function timed<T>(
  fn: () => Promise<T>,
  now: () => number = () => performance.now(),
): Promise<{ value: T; ms: number }> {
  const start = now();
  const value = await fn(); // fn 失败时异常直接向外传播，不需要 try/catch
  return { value, ms: now() - start };
}
