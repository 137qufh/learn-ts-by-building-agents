// 3.4 错误处理：错误类、cause、Result
// 运行：pnpm tsx chapters/03-async/examples/04-error-handling.ts

// ── 1. 自定义错误类 ──────────────────────────────────────────────────
class ApiError extends Error {
  override readonly name = "ApiError";
  readonly status: number;

  constructor(status: number, message: string, options?: ErrorOptions) {
    super(message, options); // 必须先调用父类的构造函数，才能使用 this
    this.status = status;
  }

  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

const rateLimited = new ApiError(429, "请求太频繁");
console.log(rateLimited instanceof ApiError, rateLimited instanceof Error); // true true
console.log(String(rateLimited), rateLimited.retryable); // ApiError: 请求太频繁 true

// ── 2. instanceof 收窄 unknown ────────────────────────────────────────
function describe(error: unknown): string {
  if (error instanceof ApiError) {
    return `HTTP ${error.status}${error.retryable ? "（可以重试）" : ""}`; // error: ApiError
  }
  if (error instanceof Error) {
    return error.message; // error: Error
  }
  return String(error);
}
console.log(describe(rateLimited)); // HTTP 429（可以重试）
console.log(describe(new TypeError("fetch failed"))); // fetch failed
console.log(describe("有人 throw 了一个字符串")); // 有人 throw 了一个字符串

// ── 3. cause：包装错误时保留原始原因 ──────────────────────────────────
function parseReply(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("模型返回的不是合法的 JSON", { cause: error });
  }
}
try {
  parseReply("{ 坏掉的");
} catch (error) {
  if (error instanceof Error) {
    console.log(error.message); // 模型返回的不是合法的 JSON
    console.log("  原因：", error.cause instanceof SyntaxError ? "SyntaxError" : error.cause); // 原因： SyntaxError
  }
}

// ── 4. 预料之中的失败：返回 Result，而不是抛出 ─────────────────────────
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

type ReadError =
  { kind: "not_found"; path: string } | { kind: "too_large"; path: string; bytes: number };

const files: Record<string, string> = { "notes.md": "# 笔记", "big.log": "x".repeat(2_000_000) };

async function readFileTool(path: string): Promise<Result<string, ReadError>> {
  const content = files[path];
  if (content === undefined) {
    return { ok: false, error: { kind: "not_found", path } };
  }
  if (content.length > 1_000_000) {
    return { ok: false, error: { kind: "too_large", path, bytes: content.length } };
  }
  return { ok: true, value: content };
}

for (const path of ["notes.md", "missing.txt", "big.log"]) {
  const result = await readFileTool(path);
  if (result.ok) {
    console.log(`${path}：${result.value}`);
    continue;
  }
  // 调用方必须处理每一种错误；漏掉一种，下面的穷尽性检查会报错
  switch (result.error.kind) {
    case "not_found":
      console.log(`${path}：文件不存在`);
      break;
    case "too_large":
      console.log(`${path}：文件太大（${result.error.bytes} 字节）`);
      break;
    default: {
      const unreachable: never = result.error;
      throw new Error(`未处理的错误：${JSON.stringify(unreachable)}`);
    }
  }
}
// notes.md：# 笔记
// missing.txt：文件不存在
// big.log：文件太大（2000000 字节）

// ── 5. 把"可能抛出"的异步操作转换成 Result ──────────────────────────────
async function attemptAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error), { cause: error }),
    };
  }
}
const outcome = await attemptAsync(async () => {
  throw new ApiError(503, "服务暂时不可用");
});
console.log(outcome.ok ? outcome.value : `失败：${outcome.error.message}`); // 失败：服务暂时不可用
