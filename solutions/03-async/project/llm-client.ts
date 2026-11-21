/**
 * 第 3 章项目参考答案：流式 LLM 客户端
 */
import type { Usage } from "../../01-basics/01-usage.ts";
import type { RawToolCall, ToolSchema } from "../../02-advanced-types/project/tool-registry.ts";
import { errorFromResponse, isRetryable } from "../04-api-errors.ts";
import { isTimeoutError } from "../06-abort.ts";
import { parseRetryAfter, retry, type RetryOptions } from "../07-retry.ts";
import { idleTimeout } from "../08-stream-tools.ts";
import { readSse, type SseEvent } from "../09-sse-parser.ts";

// ── 类型（已给出） ────────────────────────────────────────────────

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: WireToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface WireToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatRequest {
  messages: Message[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
}

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; call: RawToolCall }
  | { type: "finish"; reason: string; usage?: Usage };

export interface ChatResult {
  text: string;
  toolCalls: RawToolCall[];
  finishReason: string;
  usage?: Usage;
}

export interface ClientOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  idleTimeoutMs?: number;
  retry?: Omit<RetryOptions, "signal" | "shouldRetry" | "retryAfterMs">;
}

export interface CallOptions {
  signal?: AbortSignal;
}

export interface LlmClient {
  stream(request: ChatRequest, options?: CallOptions): AsyncGenerator<StreamEvent>;
  complete(request: ChatRequest, options?: CallOptions): Promise<ChatResult>;
}

export interface ChunkToolCallDelta {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

export interface ChatChunk {
  choices: {
    delta?: { content?: string | null; tool_calls?: ChunkToolCallDelta[] };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    prompt_tokens_details?: { cached_tokens?: number };
  } | null;
  error?: { message?: string };
}

export function parseChunk(data: string): ChatChunk {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch (error) {
    throw new Error(`无法解析的数据：${data.slice(0, 100)}`, { cause: error });
  }
  if (typeof value !== "object" || value === null) {
    throw new Error(`数据不是一个对象：${data.slice(0, 100)}`);
  }
  if (!("choices" in value) || !Array.isArray(value.choices)) {
    return { ...(value as Omit<ChatChunk, "choices">), choices: [] };
  }
  return value as ChatChunk;
}

// ── 第一部分：构造请求 ────────────────────────────────────────────

export function buildRequest(
  options: Pick<ClientOptions, "baseUrl" | "apiKey" | "model">,
  request: ChatRequest,
): { url: string; init: RequestInit } {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: request.messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (request.tools !== undefined && request.tools.length > 0) {
    body.tools = request.tools.map((tool) => ({ type: "function", function: tool }));
  }
  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }
  if (request.maxTokens !== undefined) {
    body.max_tokens = request.maxTokens;
  }
  return {
    url: `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(body),
    },
  };
}

// ── 第二部分：拼接工具调用 ────────────────────────────────────────

export interface ToolCallAccumulator {
  add(deltas: readonly ChunkToolCallDelta[]): void;
  finish(): RawToolCall[];
}

export function createToolCallAccumulator(): ToolCallAccumulator {
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  return {
    add(deltas) {
      for (const delta of deltas) {
        let call = calls.get(delta.index);
        if (call === undefined) {
          call = { id: "", name: "", arguments: "" };
          calls.set(delta.index, call);
        }
        if (delta.id) {
          call.id = delta.id;
        }
        if (delta.function?.name) {
          call.name = delta.function.name;
        }
        if (delta.function?.arguments) {
          call.arguments += delta.function.arguments;
        }
      }
    },
    finish() {
      return [...calls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([index, call]) => {
          if (call.name === "") {
            throw new Error(`第 ${index} 个工具调用没有名字`);
          }
          return {
            id: call.id || `call_${index}`,
            name: call.name,
            arguments: call.arguments || "{}",
          };
        });
    },
  };
}

// ── 第三部分：把 SSE 事件变成 StreamEvent ─────────────────────────

export async function* parseStream(events: AsyncIterable<SseEvent>): AsyncGenerator<StreamEvent> {
  const toolCalls = createToolCallAccumulator();
  let finishReason: string | undefined;
  let usage: Usage | undefined;
  let done = false;

  for await (const event of events) {
    if (event.event !== "message") {
      continue;
    }
    if (event.data === "[DONE]") {
      done = true;
      break;
    }
    const chunk = parseChunk(event.data);
    if (chunk.error) {
      throw new Error(`服务器在流中报告了错误：${chunk.error.message ?? "（没有详细信息）"}`);
    }
    if (chunk.usage) {
      usage = {
        inputTokens: chunk.usage.prompt_tokens,
        outputTokens: chunk.usage.completion_tokens,
      };
      const cached = chunk.usage.prompt_tokens_details?.cached_tokens;
      if (cached !== undefined) {
        usage.cachedInputTokens = cached;
      }
    }
    const choice = chunk.choices[0];
    if (choice === undefined) {
      continue;
    }
    const content = choice.delta?.content;
    if (content) {
      yield { type: "text", text: content };
    }
    if (choice.delta?.tool_calls) {
      toolCalls.add(choice.delta.tool_calls);
    }
    if (choice.finish_reason) {
      finishReason = choice.finish_reason;
    }
  }

  if (!done && finishReason === undefined) {
    throw new Error("响应流在完成之前就结束了");
  }
  for (const call of toolCalls.finish()) {
    yield { type: "tool_call", call };
  }
  yield usage === undefined
    ? { type: "finish", reason: finishReason ?? "unknown" }
    : { type: "finish", reason: finishReason ?? "unknown", usage };
}

// ── 第四部分：客户端 ──────────────────────────────────────────────

export function createClient(options: ClientOptions): LlmClient {
  const {
    fetch = globalThis.fetch,
    timeoutMs = 60_000,
    idleTimeoutMs = 30_000,
    retry: retryOptions = {},
  } = options;

  // errorFromResponse 返回的 ApiError 不带响应头，Retry-After 记在这里，交给 retry 的 retryAfterMs。
  // WeakMap 的键是对象，不会阻止它被垃圾回收：错误对象没人用了，这里的记录也就自动消失了
  const retryAfter = new WeakMap<object, number>();

  /** 发送一次请求，等到响应头。超时只管这一段：响应头到了就清除定时器。 */
  async function connect(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
    const timeout = new AbortController();
    const timer = setTimeout(
      () => timeout.abort(new DOMException(`等待响应超过 ${timeoutMs}ms`, "TimeoutError")),
      timeoutMs,
    );
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.any([signal, timeout.signal]),
      });
      if (!response.ok) {
        const error = await errorFromResponse(response);
        const delay = parseRetryAfter(response.headers.get("retry-after"));
        if (delay !== undefined) {
          retryAfter.set(error, delay);
        }
        throw error;
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  async function* stream(
    request: ChatRequest,
    callOptions: CallOptions = {},
  ): AsyncGenerator<StreamEvent> {
    const { url, init } = buildRequest(options, request);
    // 这次调用的总开关：无论怎样结束，最后都用它断开连接
    const connection = new AbortController();
    const signal =
      callOptions.signal === undefined
        ? connection.signal
        : AbortSignal.any([callOptions.signal, connection.signal]);
    try {
      // 只有"建立连接"这一步会重试。流开始之后出错，直接交给调用者（3.7 节）
      const response = await retry(() => connect(url, init, signal), {
        ...retryOptions,
        signal,
        shouldRetry: (error) => isRetryable(error) || isTimeoutError(error),
        retryAfterMs: (error) =>
          typeof error === "object" && error !== null ? retryAfter.get(error) : undefined,
      });
      yield* parseStream(idleTimeout(readSse(response), idleTimeoutMs));
    } finally {
      connection.abort();
    }
  }

  async function complete(
    request: ChatRequest,
    callOptions: CallOptions = {},
  ): Promise<ChatResult> {
    let text = "";
    const toolCalls: RawToolCall[] = [];
    for await (const event of stream(request, callOptions)) {
      switch (event.type) {
        case "text":
          text += event.text;
          break;
        case "tool_call":
          toolCalls.push(event.call);
          break;
        case "finish": {
          const result: ChatResult = { text, toolCalls, finishReason: event.reason };
          if (event.usage !== undefined) {
            result.usage = event.usage;
          }
          return result;
        }
      }
    }
    throw new Error("响应流在完成之前就结束了");
  }

  return { stream, complete };
}
