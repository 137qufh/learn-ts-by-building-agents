// 3.7 重试与退避：指数退避、抖动、Retry-After
// 运行：pnpm tsx chapters/03-async/examples/07-retries.ts

class ApiError extends Error {
  override readonly name = "ApiError";
  readonly status: number;
  readonly retryAfterMs: number | undefined;
  constructor(status: number, message: string, retryAfterMs?: number) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 1. 退避的计算：指数增长 + 上限 + 抖动 ─────────────────────────────
function backoffDelay(attempt: number, baseMs = 100, maxMs = 2000): number {
  return Math.min(baseMs * 2 ** (attempt - 1), maxMs);
}
function fullJitter(ms: number, random: () => number = Math.random): number {
  return Math.round(ms * random()); // 在 [0, ms) 里随机取一个
}
console.log("退避：", [1, 2, 3, 4, 5, 6].map((n) => backoffDelay(n)).join(" → ")); // 退避： 100 → 200 → 400 → 800 → 1600 → 2000
console.log(
  "抖动后（示例）：",
  [1, 2, 3].map((n) => fullJitter(backoffDelay(n), () => 0.5)),
); // 抖动后（示例）： [ 50, 100, 200 ]

// ── 2. 一个通用的 retry ───────────────────────────────────────────────
interface RetryOptions {
  retries: number; // 最多重试几次（不含第一次尝试）
  shouldRetry: (error: unknown) => boolean;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

async function retry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt > options.retries || !options.shouldRetry(error)) {
        throw error; // 次数用完，或者不值得重试：把最后一次的错误原样抛出
      }
      // 服务器说了等多久，就听服务器的；否则用退避 + 抖动
      const delayMs =
        error instanceof ApiError && error.retryAfterMs !== undefined
          ? error.retryAfterMs
          : fullJitter(backoffDelay(attempt, 10));
      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
}

const isTransient = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 429 || error.status >= 500);

// 一个前两次失败的"模型 API"
let calls = 0;
const reply = await retry(
  async () => {
    calls++;
    if (calls === 1) throw new ApiError(503, "服务暂时不可用");
    if (calls === 2) throw new ApiError(429, "请求太频繁", 20);
    return "你好！";
  },
  {
    retries: 3,
    shouldRetry: isTransient,
    onRetry: ({ attempt, delayMs, error }) =>
      console.log(
        `第 ${attempt} 次失败（${error instanceof Error ? error.message : error}），${delayMs}ms 后重试`,
      ),
  },
);
// 第 1 次失败（服务暂时不可用），?ms 后重试      ← 抖动，每次运行都不一样
// 第 2 次失败（请求太频繁），20ms 后重试          ← 来自 Retry-After
console.log(`第 ${calls} 次成功：${reply}`); // 第 3 次成功：你好！

// ── 3. 不值得重试的错误：立刻失败 ─────────────────────────────────────
try {
  await retry(
    async () => {
      throw new ApiError(401, "API 密钥无效");
    },
    { retries: 3, shouldRetry: isTransient },
  );
} catch (error) {
  console.log("没有重试：", error instanceof Error && error.message); // 没有重试： API 密钥无效
}

// ── 4. 解析 Retry-After 头：秒数或 HTTP 日期 ──────────────────────────
function parseRetryAfter(value: string, now = Date.now()): number | undefined {
  if (/^\d+$/.test(value.trim())) {
    return Number(value) * 1000;
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}
const now = Date.parse("2026-01-01T00:00:00Z");
console.log(parseRetryAfter("2"), parseRetryAfter("Thu, 01 Jan 2026 00:00:05 GMT", now)); // 2000 5000
