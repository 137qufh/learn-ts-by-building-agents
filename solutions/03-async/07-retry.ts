/**
 * 练习 3-7 参考答案：重试
 */
import { abortableSleep } from "./06-abort.ts";

export function parseRetryAfter(
  value: string | null,
  now: number = Date.now(),
): number | undefined {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") {
    return undefined;
  }
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(Number(trimmed) * 1000);
  }
  if (trimmed.endsWith("GMT")) {
    const date = Date.parse(trimmed);
    return Number.isNaN(date) ? undefined : Math.max(0, date - now);
  }
  return undefined;
}

export function backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  return Math.min(baseMs * 2 ** (attempt - 1), maxMs);
}

export function fullJitter(ms: number, random: () => number = Math.random): number {
  return Math.round(ms * random());
}

export interface RetryInfo {
  attempt: number;
  delayMs: number;
  error: unknown;
}

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  retryAfterMs?: (error: unknown) => number | undefined;
  jitter?: (ms: number) => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
  onRetry?: (info: RetryInfo) => void;
}

export async function retry<T>(
  fn: (attempt: number, signal?: AbortSignal) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    retries = 3,
    baseMs = 500,
    maxMs = 30_000,
    shouldRetry = () => true,
    retryAfterMs = () => undefined,
    jitter = fullJitter,
    sleep = abortableSleep,
    signal,
    onRetry,
  } = options;

  for (let attempt = 1; ; attempt++) {
    signal?.throwIfAborted(); // 规则 1
    try {
      return await fn(attempt, signal); // 规则 2。return await：fn 的失败才会进入下面的 catch
    } catch (error) {
      signal?.throwIfAborted(); // 规则 3
      if (attempt > retries || !shouldRetry(error, attempt)) {
        throw error; // 规则 4
      }
      const serverDelay = retryAfterMs(error);
      if (serverDelay !== undefined && serverDelay > maxMs) {
        throw error; // 规则 5：服务器要求等太久
      }
      const delayMs = serverDelay ?? jitter(backoffDelay(attempt, baseMs, maxMs));
      onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs, signal); // 规则 6
    }
  }
}
