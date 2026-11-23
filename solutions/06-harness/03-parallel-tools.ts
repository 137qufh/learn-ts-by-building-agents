/**
 * 练习 6-3 参考答案：并行执行工具，超时与取消
 */
import type { RawToolCall } from "@learn-ts/agent-kit";

export type ToolStatus = "ok" | "error" | "timeout" | "cancelled";

export interface ToolRun {
  id: string;
  name: string;
  ok: boolean;
  content: string;
  status: ToolStatus;
  durationMs: number;
}

export type ExecuteTool = (
  call: RawToolCall,
  signal: AbortSignal,
) => Promise<{ ok: boolean; content: string }>;

export interface RunToolsOptions {
  concurrency?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onResult?: (run: ToolRun) => void;
  now?: () => number;
}

export const CANCELLED_CONTENT = "已取消：这次运行被中断了，工具没有执行完";

export function timeoutContent(name: string, ms: number): string {
  return `工具 ${name} 超过 ${ms}ms 没有完成，已停止`;
}

export async function runToolCalls(
  calls: readonly RawToolCall[],
  execute: ExecuteTool,
  options: RunToolsOptions = {},
): Promise<ToolRun[]> {
  const {
    concurrency = Infinity,
    timeoutMs,
    signal,
    onResult,
    now = () => performance.now(),
  } = options;
  if (!(concurrency === Infinity || (Number.isInteger(concurrency) && concurrency >= 1))) {
    throw new RangeError(`concurrency 必须是正整数或 Infinity，收到的是 ${concurrency}`);
  }
  if (calls.length === 0) {
    return [];
  }

  const results: (ToolRun | undefined)[] = calls.map(() => undefined);
  const startedAt = new Map<number, number>();
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let nextIndex = 0;
  let active = 0;
  let settled = 0;

  const { promise, resolve } = Promise.withResolvers<ToolRun[]>();

  function finish(
    index: number,
    outcome: { ok: boolean; content: string; status: ToolStatus },
  ): void {
    if (results[index] !== undefined) {
      return; // 已经有结果了（比如先超时，工具后来才返回）：以第一个为准
    }
    const call = calls[index]!;
    const begin = startedAt.get(index);
    const run: ToolRun = {
      id: call.id,
      name: call.name,
      ...outcome,
      durationMs: begin === undefined ? 0 : now() - begin,
    };
    results[index] = run;
    settled++;
    clearTimeout(timers.get(index));
    timers.delete(index);
    if (begin !== undefined) {
      active--;
    }
    onResult?.(run);
    if (settled === calls.length) {
      signal?.removeEventListener("abort", onAbort);
      resolve(results as ToolRun[]);
    } else {
      pump();
    }
  }

  function start(index: number): void {
    const call = calls[index]!;
    active++;
    startedAt.set(index, now());
    // 每个调用一个自己的开关：超时只停这一个，整体取消通过 AbortSignal.any 传进来
    const own = new AbortController();
    const callSignal = signal === undefined ? own.signal : AbortSignal.any([signal, own.signal]);
    if (timeoutMs !== undefined) {
      const timer = setTimeout(() => {
        own.abort(new DOMException(timeoutContent(call.name, timeoutMs), "TimeoutError"));
        finish(index, {
          ok: false,
          content: timeoutContent(call.name, timeoutMs),
          status: "timeout",
        });
      }, timeoutMs);
      timers.set(index, timer);
    }
    Promise.try(() => execute(call, callSignal)).then(
      (outcome) =>
        finish(index, {
          ok: outcome.ok,
          content: outcome.content,
          status: outcome.ok ? "ok" : "error",
        }),
      (error: unknown) => {
        if (signal?.aborted) {
          finish(index, { ok: false, content: CANCELLED_CONTENT, status: "cancelled" });
        } else {
          const message = error instanceof Error ? error.message : String(error);
          finish(index, { ok: false, content: `工具执行失败：${message}`, status: "error" });
        }
      },
    );
  }

  function pump(): void {
    while (!signal?.aborted && active < concurrency && nextIndex < calls.length) {
      start(nextIndex++);
    }
  }

  function onAbort(): void {
    // 不等工具自己停下来：Promise 没法被"杀死"，我们只能不再等它
    calls.forEach((_, index) =>
      finish(index, { ok: false, content: CANCELLED_CONTENT, status: "cancelled" }),
    );
  }

  if (signal?.aborted) {
    onAbort();
  } else {
    signal?.addEventListener("abort", onAbort, { once: true });
    pump();
  }
  return promise;
}
