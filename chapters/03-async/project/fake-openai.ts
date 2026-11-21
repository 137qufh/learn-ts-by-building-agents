/**
 * 一个假的 OpenAI 兼容接口，用于测试和演示，不需要网络和 API key。
 *
 * 它是一个 FetchLike 函数：收到请求后，按事先写好的"剧本"返回一个 Response，
 * 响应体是一个真正的 ReadableStream，按剧本里的间隔一块块地吐出数据。
 * 它还会记录收到的每个请求，并且像真的 fetch 一样响应 AbortSignal。
 *
 *   const fake = createFakeOpenAI([textReply("你好")]);
 *   const client = createClient({ baseUrl: "https://fake.test/v1", apiKey: "k", model: "m", fetch: fake.fetch });
 *   await client.complete({ messages: [...] });
 *   fake.requests[0].body; // 客户端发出的请求体
 */

/** 剧本里的一步：发送一段原始文本、等待一段时间，或者让连接出错（模拟断线）。 */
export type Step = string | { delayMs: number } | { fail: Error };

export interface Script {
  /** 状态码，默认 200。 */
  status?: number;
  headers?: Record<string, string>;
  /** 返回响应头之前等待的时间（模拟服务器很慢）。 */
  headersDelayMs?: number;
  /** 响应体：依次执行的步骤。 */
  steps?: Step[];
  /** 执行完所有步骤后不结束响应，一直挂着（模拟卡住的流）。 */
  hang?: boolean;
}

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** 解析后的 JSON 请求体。 */
  body: unknown;
  /** 响应体是否被客户端取消，或者请求被中止（连接被断开）。 */
  closedByClient: boolean;
}

export interface FakeOpenAI {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  requests: RecordedRequest[];
  /** 还没用到的剧本数量。 */
  readonly remaining: number;
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** 按顺序使用 scripts：第一个请求用第一个剧本，依此类推。剧本用完后再收到请求会抛出错误。 */
export function createFakeOpenAI(scripts: Script[]): FakeOpenAI {
  const queue = [...scripts];
  const requests: RecordedRequest[] = [];
  const encoder = new TextEncoder();

  async function fakeFetch(url: string, init: RequestInit): Promise<Response> {
    const signal = init.signal ?? undefined;
    signal?.throwIfAborted();
    const recorded: RecordedRequest = {
      url,
      method: init.method ?? "GET",
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
      closedByClient: false,
    };
    requests.push(recorded);
    const script = queue.shift();
    if (script === undefined) {
      throw new Error(`假服务器的剧本用完了（这是第 ${requests.length} 个请求）`);
    }

    await sleep(script.headersDelayMs ?? 0, signal);

    const steps = [...(script.steps ?? [])];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // 真的 fetch 在请求被中止后，响应体会以 signal.reason 出错
        signal?.addEventListener(
          "abort",
          () => {
            recorded.closedByClient = true;
            try {
              controller.error(signal.reason);
            } catch {
              // 流已经结束了
            }
          },
          { once: true },
        );
      },
      async pull(controller) {
        // pull：消费者要数据时才调用，所以这里天然是拉取式的
        while (true) {
          const step = steps.shift();
          if (step === undefined) {
            if (!script.hang) {
              controller.close();
            }
            return; // hang：既不发数据也不结束
          }
          if (typeof step === "string") {
            controller.enqueue(encoder.encode(step));
            return;
          }
          if ("delayMs" in step) {
            try {
              await sleep(step.delayMs, signal);
            } catch {
              return; // 被中止了：abort 监听器已经让流出错
            }
            continue;
          }
          controller.error(step.fail);
          return;
        }
      },
      cancel() {
        recorded.closedByClient = true;
      },
    });

    return new Response(body, {
      status: script.status ?? 200,
      headers: { "Content-Type": "text/event-stream", ...script.headers },
    });
  }

  return {
    fetch: fakeFetch,
    requests,
    get remaining() {
      return queue.length;
    },
  };
}

// ── 剧本的辅助函数 ─────────────────────────────────────────────────

/** 一个 SSE 事件：data 是 JSON。 */
export function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export const DONE = "data: [DONE]\n\n";

function chunk(delta: object, finishReason: string | null = null): string {
  return sse({
    id: "chatcmpl-fake",
    object: "chat.completion.chunk",
    model: "fake-model",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  });
}

function usageChunk(inputTokens: number, outputTokens: number): string {
  return sse({
    id: "chatcmpl-fake",
    object: "chat.completion.chunk",
    model: "fake-model",
    choices: [],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  });
}

export interface ReplyOptions {
  /** 每个片段之间的间隔，默认 0。 */
  delayMs?: number;
  /** 每个片段的字符数，默认 1（一个字一个字地吐）。 */
  chunkSize?: number;
  usage?: { inputTokens: number; outputTokens: number };
}

/** 把文本按 chunkSize 切成片段（按字符，而不是按 UTF-16 单元，emoji 不会被切坏）。 */
function pieces(text: string, size: number): string[] {
  const chars = [...text];
  const result: string[] = [];
  for (let i = 0; i < chars.length; i += size) {
    result.push(chars.slice(i, i + size).join(""));
  }
  return result;
}

function withDelays(parts: string[], delayMs: number): Step[] {
  return parts.flatMap((part): Step[] => (delayMs > 0 ? [{ delayMs }, part] : [part]));
}

/** 一个普通的文本回复，形状和 OpenAI 的流式响应一致。 */
export function textReply(text: string, options: ReplyOptions = {}): Script {
  const {
    delayMs = 0,
    chunkSize = 1,
    usage = { inputTokens: 10, outputTokens: [...text].length },
  } = options;
  return {
    steps: [
      chunk({ role: "assistant", content: "" }),
      ...withDelays(
        pieces(text, chunkSize).map((piece) => chunk({ content: piece })),
        delayMs,
      ),
      chunk({}, "stop"),
      usageChunk(usage.inputTokens, usage.outputTokens),
      DONE,
    ],
  };
}

export interface FakeToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** 一个调用工具的回复：参数被切成小段，分好几个 chunk 到达，和真实的接口一样。 */
export function toolCallReply(
  calls: FakeToolCall[],
  options: ReplyOptions & { text?: string } = {},
): Script {
  const { delayMs = 0, chunkSize = 4, text } = options;
  const parts: string[] = [];
  if (text !== undefined) {
    parts.push(...pieces(text, 1).map((piece) => chunk({ content: piece })));
  }
  calls.forEach((call, index) => {
    parts.push(
      chunk({
        tool_calls: [
          { index, id: call.id, type: "function", function: { name: call.name, arguments: "" } },
        ],
      }),
    );
    for (const piece of pieces(call.arguments, chunkSize)) {
      parts.push(chunk({ tool_calls: [{ index, function: { arguments: piece } }] }));
    }
  });
  return {
    steps: [
      chunk({ role: "assistant", content: null }),
      ...withDelays(parts, delayMs),
      chunk({}, "tool_calls"),
      usageChunk(20, 15),
      DONE,
    ],
  };
}

/** 一个错误响应，body 的格式和 OpenAI 一致。 */
export function errorReply(
  status: number,
  message: string,
  options: { type?: string; headers?: Record<string, string> } = {},
): Script {
  return {
    status,
    headers: { "Content-Type": "application/json", ...options.headers },
    steps: [JSON.stringify({ error: { message, type: options.type ?? "api_error" } })],
  };
}
