/**
 * 第 3 章项目：流式 LLM 客户端
 *
 * 课程：chapters/03-async/10-project-streaming-client.md
 * 运行：pnpm ex llm-client
 * 演示：pnpm tsx chapters/03-async/project/demo.ts
 *
 * 实现一个 OpenAI 兼容接口（/chat/completions）的流式客户端：
 *
 *   const client = createClient({ baseUrl, apiKey, model });
 *   for await (const event of client.stream({ messages }, { signal })) {
 *     if (event.type === "text") process.stdout.write(event.text);
 *   }
 *   const result = await client.complete({ messages, tools }); // 等待完整结果
 *
 * 它要做到：
 * - 文本到一块，交出一块；工具调用的参数分段到达，拼好后再交出
 * - 连接失败、5xx、429 时自动重试（遵守 Retry-After），流开始之后不重试
 * - 等待响应头有超时，流中途卡住也有超时
 * - 随时可以取消；无论怎样结束，都断开连接，不留下定时器
 *
 * 这个项目会用到你在本章练习 4、6、7、8、9 里写的函数（见下面的 import），
 * 请先完成那些练习。测试不需要网络，也不需要 API key：它们用的是
 * chapters/03-async/project/fake-openai.ts 里的假服务器。
 *
 * 按顺序完成四个部分，每部分都有对应的测试。
 */
import type { Usage } from "../../01-basics/01-usage.ts";
import type { RawToolCall, ToolSchema } from "../../02-advanced-types/project/tool-registry.ts";
import { errorFromResponse, isRetryable } from "../04-api-errors.ts";
import { isTimeoutError } from "../06-abort.ts";
import { parseRetryAfter, retry, type RetryOptions } from "../07-retry.ts";
import { idleTimeout } from "../08-stream-tools.ts";
import { readSse, type SseEvent } from "../09-sse-parser.ts";
import { todo } from "../../todo.ts";

// 这些导入在你实现第三、四部分时会用到。下面这行只是为了避免"导入了但没有使用"的提示，实现后可以删掉
void [errorFromResponse, isRetryable, isTimeoutError, parseRetryAfter, retry, idleTimeout, readSse];

// ── 类型（已给出） ────────────────────────────────────────────────

/** fetch 的类型。默认使用全局的 fetch；测试里换成假服务器。 */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** 聊天消息，直接使用 OpenAI 接口的格式（第 6 章的 agent 主循环会构造这些消息）。 */
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

/** 一次请求。tools 直接使用第 2 章工具注册表的 schemas() 的结果。 */
export interface ChatRequest {
  messages: Message[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * stream() 产出的事件：
 * - text：一段新的文本（增量，不是到目前为止的全文）
 * - tool_call：一个完整的工具调用（参数已经拼好），格式就是第 2 章的 RawToolCall
 * - finish：最后一个事件。reason 是 "stop"、"length"、"tool_calls" 等，usage 是第 1 章的 Usage
 */
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
  /** 例如 "https://api.openai.com/v1"、"https://api.deepseek.com/v1"、"http://localhost:11434/v1"。 */
  baseUrl: string;
  apiKey: string;
  model: string;
  fetch?: FetchLike;
  /** 每次尝试等待响应头的最长时间，默认 60000。响应头到达之后就不再限制。 */
  timeoutMs?: number;
  /** 流中两块数据之间的最长间隔，默认 30000。 */
  idleTimeoutMs?: number;
  /** 传给练习 7 的 retry。signal、shouldRetry、retryAfterMs 由客户端自己决定，不允许外部传入。 */
  retry?: Omit<RetryOptions, "signal" | "shouldRetry" | "retryAfterMs">;
}

export interface CallOptions {
  signal?: AbortSignal;
}

export interface LlmClient {
  stream(request: ChatRequest, options?: CallOptions): AsyncGenerator<StreamEvent>;
  complete(request: ChatRequest, options?: CallOptions): Promise<ChatResult>;
}

// ── 接口返回的数据（已给出） ────────────────────────────────────────

/** 流式响应里，工具调用的一个片段。同一个调用的片段有相同的 index；id 和名字通常只在第一个片段里出现。 */
export interface ChunkToolCallDelta {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

/** 流式响应里每个 data 的 JSON 的形状（只列出了我们用到的字段）。 */
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

/**
 * 解析一个 data。这里只检查了"是一个对象"，其余的字段用 as 断言，相信服务器。
 * 第 5 章会用 Zod 做真正的校验。不是 JSON 时抛出 Error。
 */
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

/**
 * 构造请求的 URL 和 RequestInit（不发送）。
 * - URL：baseUrl 后面加 /chat/completions。baseUrl 末尾可能有 "/"，不要出现两个斜杠
 * - POST；请求头 Content-Type: application/json、Accept: text/event-stream、Authorization: Bearer <apiKey>
 * - 请求体（JSON 字符串）：
 *   { model, messages, stream: true, stream_options: { include_usage: true } }
 *   tools 非空时加上 tools，每个 ToolSchema 包装成 { type: "function", function: schema }
 *   temperature 提供了才加；maxTokens 提供了才加，字段名是 max_tokens
 */
export function buildRequest(
  options: Pick<ClientOptions, "baseUrl" | "apiKey" | "model">,
  request: ChatRequest,
): { url: string; init: RequestInit } {
  return todo("实现 buildRequest");
}

// ── 第二部分：拼接工具调用 ────────────────────────────────────────

export interface ToolCallAccumulator {
  /** 加入一批片段。 */
  add(deltas: readonly ChunkToolCallDelta[]): void;
  /** 返回拼好的全部调用，按 index 从小到大排列。 */
  finish(): RawToolCall[];
}

/**
 * 模型的工具调用是分段到达的：
 *
 *   { index: 0, id: "call_1", function: { name: "get_weather", arguments: "" } }
 *   { index: 0, function: { arguments: '{"ci' } }
 *   { index: 0, function: { arguments: 'ty":"北京"}' } }
 *   { index: 1, id: "call_2", function: { name: "add", arguments: '{"a":1,' } }   ← 第二个调用
 *
 * 规则：
 * - 按 index 区分不同的调用
 * - arguments 拼接起来；id 和 name 出现时 **设置**（不是拼接：有些服务每个片段都重复发送它们）
 * - finish 时：没有名字的调用抛出 Error；没有 id 的用 `call_${index}`；arguments 为空的用 "{}"
 *
 * 提示：Map<number, ...>
 */
export function createToolCallAccumulator(): ToolCallAccumulator {
  return todo("实现 createToolCallAccumulator");
}

// ── 第三部分：把 SSE 事件变成 StreamEvent ─────────────────────────

/**
 * 输入是练习 9 的 SseEvent，输出 StreamEvent。规则：
 * - event 不是 "message" 的事件跳过
 * - data 是 "[DONE]"：流结束，**不再读取** 后面的事件
 * - 其他 data 用 parseChunk 解析：
 *   - 有 error 字段：抛出 Error，消息里包含 error.message
 *   - 有 usage：记下来，转换成 Usage（prompt_tokens → inputTokens，completion_tokens → outputTokens，
 *     prompt_tokens_details.cached_tokens 存在时 → cachedInputTokens）
 *   - choices[0] 的 delta.content 非空：立刻产出 text 事件
 *   - delta.tool_calls：交给第二部分的累加器
 *   - finish_reason 非空：记下来
 * - 流结束后：
 *   - 既没有遇到 [DONE]，也没有 finish_reason：响应被截断了，抛出 Error("响应流在完成之前就结束了")
 *   - 否则依次产出每个 tool_call 事件，最后产出 finish 事件（没有 finish_reason 时 reason 为 "unknown"；
 *     没有 usage 时 finish 事件里没有 usage 属性）
 */
export async function* parseStream(events: AsyncIterable<SseEvent>): AsyncGenerator<StreamEvent> {
  yield todo("实现 parseStream");
}

// ── 第四部分：客户端 ──────────────────────────────────────────────

/**
 * 创建客户端。
 *
 * stream(request, { signal })：
 * 1. 用 buildRequest 构造请求
 * 2. 发送请求，等到响应头（每次尝试都有 timeoutMs 的超时，超时的错误是 name 为 "TimeoutError" 的 DOMException）。
 *    响应不是 2xx 时，用 errorFromResponse 得到 ApiError 并抛出
 * 3. 第 2 步失败时用 retry 重试：ApiError 按 isRetryable 判断，网络错误（TypeError）和等待响应头超时也重试；
 *    429 等响应带有 Retry-After 时，按它等待（parseRetryAfter）。options.retry 里的其他选项原样传给 retry
 * 4. 拿到响应后：readSse → idleTimeout → parseStream，产出事件。这一步出错不重试
 * 5. 无论怎样结束（正常结束、出错、被取消、消费者提前 break），都要断开连接
 *
 * 取消：signal 被取消时，等待响应头、等待重试、读取流的过程都要立刻停下，以 signal.reason 拒绝。
 *
 * complete(request, { signal })：消费 stream，返回拼好的 ChatResult（usage 没有时不出现）。
 *
 * 难点提示（先自己想，卡住了再看 10 节的讲解）：
 * - 练习 6 的 withTimeout 在这里不合适：它的定时器在 task 完成之后还会继续计时，
 *   到时间会把 signal 取消，正在读的流就被掐断了。超时只应该覆盖"等待响应头"这一段
 * - errorFromResponse 返回的 ApiError 里没有响应头，Retry-After 要想办法交给 retry 的 retryAfterMs
 * - "断开连接"：给 fetch 的 signal 里合并一个你自己控制的 AbortController（AbortSignal.any），
 *   在 finally 里 abort 它
 */
export function createClient(options: ClientOptions): LlmClient {
  return todo("实现 createClient");
}
