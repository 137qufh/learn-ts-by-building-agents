import { describe, expect, test } from "vitest";
import {
  ApiError,
  attemptAsync,
  errorFromResponse,
  formatErrorChain,
  isRetryable,
  toError,
} from "./04-api-errors.ts";

describe("ApiError", () => {
  test("是 Error 的子类，带着 status 和 errorType", () => {
    const error = new ApiError(429, "HTTP 429：太快了", { errorType: "rate_limit_error" });
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ApiError");
    expect(error.message).toBe("HTTP 429：太快了");
    expect(error.status).toBe(429);
    expect(error.errorType).toBe("rate_limit_error");
    expect(String(error)).toBe("ApiError: HTTP 429：太快了");
  });

  test("errorType 默认是 undefined", () => {
    expect(new ApiError(500, "x").errorType).toBeUndefined();
  });

  test("传入 cause 时保留它；没传时没有 cause 属性", () => {
    const cause = new Error("底层原因");
    expect(new ApiError(500, "x", { cause }).cause).toBe(cause);
    expect("cause" in new ApiError(500, "x")).toBe(false);
  });

  test.each([
    [408, true],
    [409, true],
    [429, true],
    [500, true],
    [503, true],
    [529, true],
    [400, false],
    [401, false],
    [403, false],
    [404, false],
    [422, false],
  ])("status %i 的 retryable 是 %s", (status, expected) => {
    expect(new ApiError(status, "x").retryable).toBe(expected);
  });
});

describe("errorFromResponse", () => {
  test("OpenAI 风格的 JSON 错误", async () => {
    const response = new Response(
      JSON.stringify({
        error: { message: "Rate limit reached", type: "rate_limit_error", code: null },
      }),
      { status: 429, headers: { "content-type": "application/json" } },
    );
    const error = await errorFromResponse(response);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(429);
    expect(error.message).toBe("HTTP 429：Rate limit reached");
    expect(error.errorType).toBe("rate_limit_error");
  });

  test("JSON 里没有 type 时 errorType 是 undefined", async () => {
    const error = await errorFromResponse(
      new Response('{"error":{"message":"bad"}}', { status: 400 }),
    );
    expect(error.message).toBe("HTTP 400：bad");
    expect(error.errorType).toBeUndefined();
  });

  test("type 不是字符串时 errorType 是 undefined", async () => {
    const error = await errorFromResponse(
      new Response('{"error":{"message":"bad","type":42}}', { status: 400 }),
    );
    expect(error.errorType).toBeUndefined();
  });

  test("格式不对的 JSON 按纯文本处理", async () => {
    const error = await errorFromResponse(
      new Response('{"error":"just a string"}', { status: 400 }),
    );
    expect(error.message).toBe('HTTP 400：{"error":"just a string"}');
  });

  test("纯文本：去掉首尾空白", async () => {
    const error = await errorFromResponse(new Response("  Bad Gateway\n", { status: 502 }));
    expect(error.message).toBe("HTTP 502：Bad Gateway");
  });

  test("太长的文本截断到 200 个字符", async () => {
    const html = `<html>${"x".repeat(500)}</html>`;
    const error = await errorFromResponse(new Response(html, { status: 503 }));
    expect(error.message).toBe(`HTTP 503：${html.slice(0, 200)}…`);
  });

  test("正好 200 个字符时不截断", async () => {
    const text = "y".repeat(200);
    const error = await errorFromResponse(new Response(text, { status: 500 }));
    expect(error.message).toBe(`HTTP 500：${text}`);
  });

  test("空响应体用 statusText", async () => {
    const error = await errorFromResponse(
      new Response("", { status: 503, statusText: "Service Unavailable" }),
    );
    expect(error.message).toBe("HTTP 503：Service Unavailable");
  });

  test("什么都没有时", async () => {
    const error = await errorFromResponse(new Response(null, { status: 500 }));
    expect(error.message).toBe("HTTP 500：（没有详细信息）");
  });
});

describe("isRetryable", () => {
  test("ApiError 看 retryable", () => {
    expect(isRetryable(new ApiError(429, "x"))).toBe(true);
    expect(isRetryable(new ApiError(401, "x"))).toBe(false);
  });

  test("网络故障（TypeError）值得重试", () => {
    expect(isRetryable(new TypeError("fetch failed"))).toBe(true);
  });

  test("取消和超时不重试", () => {
    expect(isRetryable(new DOMException("用户取消", "AbortError"))).toBe(false);
    expect(isRetryable(new DOMException("超时", "TimeoutError"))).toBe(false);
  });

  test("其他错误不重试", () => {
    expect(isRetryable(new Error("bug"))).toBe(false);
    expect(isRetryable(new SyntaxError("坏 JSON"))).toBe(false);
    expect(isRetryable("字符串")).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});

describe("formatErrorChain", () => {
  test("单个错误", () => {
    expect(formatErrorChain(new Error("出错了"))).toBe("出错了");
  });

  test("沿着 cause 链", () => {
    const inner = new Error("ECONNRESET");
    const middle = new TypeError("fetch failed", { cause: inner });
    const outer = new Error("调用模型失败", { cause: middle });
    expect(formatErrorChain(outer)).toBe("调用模型失败 ← fetch failed ← ECONNRESET");
  });

  test("cause 不是 Error 时用 String() 并结束", () => {
    expect(formatErrorChain(new Error("外层", { cause: 404 }))).toBe("外层 ← 404");
    expect(formatErrorChain("只是一个字符串")).toBe("只是一个字符串");
  });

  test("cause 链成环时停下", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    Object.defineProperty(a, "cause", { value: b });
    expect(formatErrorChain(b)).toBe("b ← a");
  });
});

describe("toError / attemptAsync", () => {
  test("toError：Error 原样返回", () => {
    const error = new RangeError("x");
    expect(toError(error)).toBe(error);
  });

  test("toError：其他值包装成 Error，原值放在 cause", () => {
    const wrapped = toError({ code: 1 });
    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped.message).toBe("[object Object]");
    expect(wrapped.cause).toEqual({ code: 1 });
    expect(toError("坏了").message).toBe("坏了");
  });

  test("attemptAsync：成功", async () => {
    await expect(attemptAsync(async () => 42)).resolves.toEqual({ ok: true, value: 42 });
  });

  test("attemptAsync：失败被包装，不会拒绝", async () => {
    const error = new ApiError(503, "x");
    await expect(attemptAsync(() => Promise.reject(error))).resolves.toEqual({ ok: false, error });
    const result = await attemptAsync(() => Promise.reject("字符串"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("字符串");
    }
  });

  test("attemptAsync：fn 同步抛出也被包装", async () => {
    const result = await attemptAsync(() => {
      throw new Error("同步");
    });
    expect(result).toMatchObject({ ok: false });
  });
});
