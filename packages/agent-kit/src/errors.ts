/**
 * API 错误的类型与工具函数（来自练习 3-4）
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
    // 只在真的有 cause 时才传：{ cause: undefined } 也会在错误上创建一个值为 undefined 的 cause 属性
    super(message, "cause" in options ? { cause: options.cause } : undefined);
    this.status = status;
    this.errorType = options.errorType;
  }

  get retryable(): boolean {
    return this.status === 408 || this.status === 409 || this.status === 429 || this.status >= 500;
  }
}

const MAX_DETAIL_LENGTH = 200;

export async function errorFromResponse(response: Response): Promise<ApiError> {
  // 读取响应体本身也可能失败（连接中途断开），这时当作没有响应体
  const text = await response.text().catch(() => "");
  const parsed = parseErrorBody(text);
  if (parsed !== undefined) {
    return new ApiError(
      response.status,
      `HTTP ${response.status}：${parsed.message}`,
      parsed.type === undefined ? {} : { errorType: parsed.type },
    );
  }

  const trimmed = text.trim();
  const detail =
    trimmed.length > MAX_DETAIL_LENGTH
      ? `${trimmed.slice(0, MAX_DETAIL_LENGTH)}…`
      : trimmed || response.statusText || "（没有详细信息）";
  return new ApiError(response.status, `HTTP ${response.status}：${detail}`);
}

/** 尝试按 { error: { message, type } } 的格式解析；格式不符时返回 undefined。 */
function parseErrorBody(text: string): { message: string; type: string | undefined } | undefined {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return undefined; // 不是 JSON：交给调用方按纯文本处理
  }
  // 逐层收窄 unknown（1.7 节）。`in` 检查之后，TS 知道属性存在，但它的值仍然是 unknown
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return undefined;
  }
  const error = body.error;
  if (
    typeof error !== "object" ||
    error === null ||
    !("message" in error) ||
    typeof error.message !== "string"
  ) {
    return undefined;
  }
  const type = "type" in error && typeof error.type === "string" ? error.type : undefined;
  return { message: error.message, type };
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.retryable;
  }
  // 取消和超时的错误是 DOMException，它也是 Error 的子类，但不是 TypeError，所以这里不会误判
  if (error instanceof TypeError) {
    return true;
  }
  return false;
}

export function formatErrorChain(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    if (!(current instanceof Error)) {
      // 非 Error 的值什么都可能是（字符串、数字、对象），String() 是最稳妥的兜底
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      parts.push(String(current));
      break;
    }
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join(" ← ");
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value), { cause: value });
}

export async function attemptAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error: toError(error) };
  }
}
