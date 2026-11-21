/**
 * 练习 3-4：API 错误
 *
 * 课程：chapters/03-async/04-error-handling.md
 * 运行：pnpm ex 04-api-errors
 *
 * 章末的 LLM 客户端需要回答两个问题：请求失败时，错误信息怎么写才有用？这个错误值得重试吗？
 * 这道题实现它们。做完的代码可以直接在章末项目里使用。
 */
import { todo } from "../todo.ts";

/**
 * 模型 API 返回的 HTTP 错误。
 *
 * - status：HTTP 状态码
 * - errorType：响应体里的错误类型（比如 OpenAI 的 "rate_limit_error"），没有时是 undefined
 * - name 是 "ApiError"
 * - cause：通过 options.cause 传入时，原样传给 Error（super 的第二个参数）
 *
 * 属性已经声明好了，你来写构造函数和 retryable。
 */
export class ApiError extends Error {
  override readonly name = "ApiError";
  readonly status: number;
  readonly errorType: string | undefined;

  constructor(
    status: number,
    message: string,
    options: { errorType?: string; cause?: unknown } = {},
  ) {
    super(message);
    todo("实现 ApiError 的构造函数");
  }

  /**
   * 是否值得重试：408（请求超时）、409（冲突）、429（限流）和所有 5xx 是 true，其他是 false。
   * 400、401、403、404 这类错误，重试多少次结果都一样。
   */
  get retryable(): boolean {
    return todo("实现 retryable");
  }
}

/**
 * 从一个失败的 HTTP 响应（response.ok 为 false）构造 ApiError。
 *
 * 读取响应体的文本（await response.text()），按以下规则得到"详情"：
 * 1. 是 JSON，并且形如 { "error": { "message": "...", "type": "..." } }：详情是 error.message，
 *    errorType 是 error.type（type 不存在或不是字符串时为 undefined）
 * 2. 否则，如果文本去掉首尾空白后不为空：详情是这段文本，超过 200 个字符时只保留前 200 个并加上 "…"
 * 3. 否则：详情是 response.statusText；它也为空时，详情是 "（没有详细信息）"
 *
 * message 的格式是 `HTTP ${status}：${详情}`，例如 "HTTP 429：Rate limit reached"。
 *
 * 响应体可能是任何东西（HTML 错误页、空字符串、格式不对的 JSON），这个函数本身绝不能因此抛出异常。
 */
export async function errorFromResponse(response: Response): Promise<ApiError> {
  return todo("实现 errorFromResponse");
}

/**
 * 判断一个 catch 到的错误是否值得重试：
 * - ApiError：看它的 retryable
 * - TypeError：fetch 遇到网络故障时抛出的就是 TypeError，值得重试
 * - name 为 "AbortError" 或 "TimeoutError" 的错误（取消、超时）：不重试
 * - 其他一切：不重试
 */
export function isRetryable(error: unknown): boolean {
  return todo("实现 isRetryable");
}

/**
 * 把错误和它的 cause 链格式化成一行，用 " ← " 连接，最外层在前：
 *
 *   formatErrorChain(new Error("调用模型失败", { cause: new TypeError("fetch failed") }))
 *   // "调用模型失败 ← fetch failed"
 *
 * - Error：取它的 message，然后继续看它的 cause（cause 为 undefined 时结束）
 * - 不是 Error 的值：用 String(值)，并且结束（不再往下看）
 * - cause 链可能成环（a.cause = b，b.cause = a），遇到已经出现过的错误时停下
 */
export function formatErrorChain(error: unknown): string {
  return todo("实现 formatErrorChain");
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/**
 * 把 catch 到的任何值变成 Error：本身是 Error 就原样返回；否则用 String(值) 作为 message
 * 新建一个 Error，并把原来的值放在 cause 里。
 */
export function toError(value: unknown): Error {
  return todo("实现 toError");
}

/** 执行 fn，把结果包装成 Result：成功是 { ok: true, value }，失败是 { ok: false, error: toError(异常) }。 */
export async function attemptAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  return todo("实现 attemptAsync");
}
