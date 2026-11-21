import { createServer } from "node:http";
import { describe, expect, test } from "vitest";
import {
  createFakeOpenAI,
  DONE,
  errorReply,
  sse,
  textReply,
  toolCallReply,
  type Script,
} from "../../../chapters/03-async/project/fake-openai.ts";
import { ApiError } from "../04-api-errors.ts";
import type { SseEvent } from "../09-sse-parser.ts";
import {
  buildRequest,
  createClient,
  createToolCallAccumulator,
  parseStream,
  type ChatRequest,
  type ClientOptions,
  type StreamEvent,
} from "./llm-client.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function drain<T>(source: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of source) {
    items.push(item);
  }
  return items;
}

/** 捕获一个 Promise 的拒绝原因；没有拒绝时测试失败。 */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("预期会失败，但成功了");
}

const BASE = { baseUrl: "https://fake.test/v1", apiKey: "sk-test", model: "fake-model" };
const HELLO: ChatRequest = { messages: [{ role: "user", content: "你好" }] };

/** 用假服务器创建客户端。默认不等待重试（sleep 立刻返回），记录每次的等待时间。 */
function setup(scripts: Script[], options: Partial<ClientOptions> = {}) {
  const fake = createFakeOpenAI(scripts);
  const delays: number[] = [];
  const client = createClient({
    ...BASE,
    fetch: fake.fetch,
    ...options,
    retry: {
      sleep: async (ms) => {
        delays.push(ms);
      },
      ...options.retry,
    },
  });
  return { fake, client, delays };
}

function events(...data: string[]): AsyncGenerator<SseEvent> {
  return (async function* () {
    for (const d of data) {
      yield { event: "message", data: d };
    }
  })();
}

function chunk(delta: object, finishReason: string | null = null): string {
  return JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finishReason }] });
}

// ── 第一部分 ────────────────────────────────────────────────────────

describe("第一部分：buildRequest", () => {
  test("URL：baseUrl 加上 /chat/completions，末尾有没有斜杠都可以", () => {
    expect(buildRequest(BASE, HELLO).url).toBe("https://fake.test/v1/chat/completions");
    expect(buildRequest({ ...BASE, baseUrl: "http://localhost:11434/v1/" }, HELLO).url).toBe(
      "http://localhost:11434/v1/chat/completions",
    );
  });

  test("POST，带上 API key 和内容类型", () => {
    const { init } = buildRequest(BASE, HELLO);
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer sk-test");
    expect(headers.get("content-type")).toBe("application/json");
  });

  test("请求体：模型、消息、开启流式和用量统计", () => {
    const body: unknown = JSON.parse(String(buildRequest(BASE, HELLO).init.body));
    expect(body).toEqual({
      model: "fake-model",
      messages: [{ role: "user", content: "你好" }],
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  test("可选参数：只在提供了的时候出现，maxTokens 改名为 max_tokens", () => {
    const body: unknown = JSON.parse(
      String(buildRequest(BASE, { ...HELLO, temperature: 0, maxTokens: 100 }).init.body),
    );
    expect(body).toMatchObject({ temperature: 0, max_tokens: 100 });
    expect(body).not.toHaveProperty("maxTokens");
  });

  test("工具：第 2 章的 ToolSchema 包装成 { type: 'function', function: ... }；空数组不发送", () => {
    const schema = {
      name: "get_weather",
      description: "查询天气",
      parameters: {
        type: "object" as const,
        properties: { city: { type: "string" as const } },
        required: ["city"],
        additionalProperties: false as const,
      },
    };
    const body: unknown = JSON.parse(
      String(buildRequest(BASE, { ...HELLO, tools: [schema] }).init.body),
    );
    expect(body).toMatchObject({ tools: [{ type: "function", function: schema }] });

    const empty: unknown = JSON.parse(
      String(buildRequest(BASE, { ...HELLO, tools: [] }).init.body),
    );
    expect(empty).not.toHaveProperty("tools");
  });
});

// ── 第二部分 ────────────────────────────────────────────────────────

describe("第二部分：createToolCallAccumulator", () => {
  test("参数分好几段到达，拼接起来", () => {
    const acc = createToolCallAccumulator();
    acc.add([{ index: 0, id: "call_1", function: { name: "get_weather", arguments: "" } }]);
    acc.add([{ index: 0, function: { arguments: '{"ci' } }]);
    acc.add([{ index: 0, function: { arguments: 'ty":"北京"}' } }]);
    expect(acc.finish()).toEqual([
      { id: "call_1", name: "get_weather", arguments: '{"city":"北京"}' },
    ]);
  });

  test("多个调用按 index 区分，结果按 index 排序", () => {
    const acc = createToolCallAccumulator();
    acc.add([{ index: 1, id: "b", function: { name: "two", arguments: "{" } }]);
    acc.add([{ index: 0, id: "a", function: { name: "one", arguments: "{}" } }]);
    acc.add([{ index: 1, function: { arguments: "}" } }]);
    expect(acc.finish()).toEqual([
      { id: "a", name: "one", arguments: "{}" },
      { id: "b", name: "two", arguments: "{}" },
    ]);
  });

  test("有些服务每段都重复 id 和名字：不能重复拼接名字", () => {
    const acc = createToolCallAccumulator();
    acc.add([{ index: 0, id: "c", function: { name: "add", arguments: '{"a":' } }]);
    acc.add([{ index: 0, id: "c", function: { name: "add", arguments: "1}" } }]);
    expect(acc.finish()).toEqual([{ id: "c", name: "add", arguments: '{"a":1}' }]);
  });

  test("没有 id 时用 call_<index>；没有参数时用 {}", () => {
    const acc = createToolCallAccumulator();
    acc.add([{ index: 0, function: { name: "now" } }]);
    expect(acc.finish()).toEqual([{ id: "call_0", name: "now", arguments: "{}" }]);
  });

  test("没有名字的调用：finish 时抛出", () => {
    const acc = createToolCallAccumulator();
    acc.add([{ index: 0, id: "x", function: { arguments: "{}" } }]);
    expect(() => acc.finish()).toThrow();
  });

  test("没有任何调用时得到空数组", () => {
    expect(createToolCallAccumulator().finish()).toEqual([]);
  });
});

// ── 第三部分 ────────────────────────────────────────────────────────

describe("第三部分：parseStream", () => {
  test("文本片段逐个产出，最后是 finish", async () => {
    const result = await drain(
      parseStream(
        events(
          chunk({ role: "assistant", content: "" }),
          chunk({ content: "你" }),
          chunk({ content: "好" }),
          chunk({}, "stop"),
          DONE.slice("data: ".length).trim(),
        ),
      ),
    );
    expect(result).toEqual([
      { type: "text", text: "你" },
      { type: "text", text: "好" },
      { type: "finish", reason: "stop" },
    ]);
  });

  test("用量：换成第 1 章的 Usage 格式，包括缓存命中的 token", async () => {
    const usage = JSON.stringify({
      choices: [],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        prompt_tokens_details: { cached_tokens: 80 },
      },
    });
    const result = await drain(parseStream(events(chunk({}, "stop"), usage, "[DONE]")));
    expect(result.at(-1)).toEqual({
      type: "finish",
      reason: "stop",
      usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 80 },
    });
  });

  test("没有缓存信息时，usage 里没有 cachedInputTokens 属性", async () => {
    const usage = JSON.stringify({
      choices: [],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    });
    const result = await drain(parseStream(events(chunk({}, "stop"), usage, "[DONE]")));
    const finish = result.at(-1);
    expect(finish).toEqual({
      type: "finish",
      reason: "stop",
      usage: { inputTokens: 1, outputTokens: 2 },
    });
  });

  test("工具调用：参数拼好后作为完整的 tool_call 事件产出，在 finish 之前", async () => {
    const result = await drain(
      parseStream(
        events(
          chunk({ content: "我查一下" }),
          chunk({
            tool_calls: [
              { index: 0, id: "call_1", function: { name: "get_weather", arguments: "" } },
            ],
          }),
          chunk({ tool_calls: [{ index: 0, function: { arguments: '{"city":' } }] }),
          chunk({ tool_calls: [{ index: 0, function: { arguments: '"北京"}' } }] }),
          chunk({}, "tool_calls"),
          "[DONE]",
        ),
      ),
    );
    expect(result).toEqual([
      { type: "text", text: "我查一下" },
      {
        type: "tool_call",
        call: { id: "call_1", name: "get_weather", arguments: '{"city":"北京"}' },
      },
      { type: "finish", reason: "tool_calls" },
    ]);
  });

  test("文本一到就产出，不等流结束", async () => {
    let more = false;
    async function* source(): AsyncGenerator<SseEvent> {
      yield { event: "message", data: chunk({ content: "第一个字" }) };
      more = true;
      yield { event: "message", data: chunk({}, "stop") };
      yield { event: "message", data: "[DONE]" };
    }
    for await (const event of parseStream(source())) {
      expect(event).toEqual({ type: "text", text: "第一个字" });
      expect(more).toBe(false);
      break;
    }
  });

  test("遇到 [DONE] 就停止，不再读取后面的事件", async () => {
    let readAfterDone = false;
    async function* source(): AsyncGenerator<SseEvent> {
      yield { event: "message", data: chunk({}, "stop") };
      yield { event: "message", data: "[DONE]" };
      readAfterDone = true;
      yield { event: "message", data: "不应该被读到" };
    }
    await drain(parseStream(source()));
    expect(readAfterDone).toBe(false);
  });

  test("跳过 event 不是 message 的事件", async () => {
    async function* source(): AsyncGenerator<SseEvent> {
      yield { event: "ping", data: "这不是 JSON" };
      yield { event: "message", data: chunk({ content: "x" }) };
      yield { event: "message", data: chunk({}, "stop") };
      yield { event: "message", data: "[DONE]" };
    }
    expect((await drain(parseStream(source())))[0]).toEqual({ type: "text", text: "x" });
  });

  test("有 finish_reason 但没有 [DONE]：也算正常结束", async () => {
    const result = await drain(parseStream(events(chunk({ content: "x" }), chunk({}, "length"))));
    expect(result.at(-1)).toEqual({ type: "finish", reason: "length" });
  });

  test("既没有 finish_reason 也没有 [DONE]：流被截断了，抛出", async () => {
    await expect(drain(parseStream(events(chunk({ content: "说到一半" }))))).rejects.toThrow(
      "响应流在完成之前就结束了",
    );
  });

  test("流里的错误事件：抛出，消息里带上服务器的说明", async () => {
    const error = JSON.stringify({ error: { message: "模型过载" } });
    await expect(drain(parseStream(events(chunk({ content: "x" }), error)))).rejects.toThrow(
      "模型过载",
    );
  });

  test("不是 JSON 的数据：抛出", async () => {
    await expect(drain(parseStream(events("{坏掉的 JSON")))).rejects.toThrow("无法解析");
  });
});

// ── 第四部分 ────────────────────────────────────────────────────────

describe("第四部分：createClient", () => {
  describe("正常情况", () => {
    test("complete：拼出完整的回复", async () => {
      const { client } = setup([
        textReply("你好，我是假模型。", { usage: { inputTokens: 5, outputTokens: 9 } }),
      ]);
      expect(await client.complete(HELLO)).toEqual({
        text: "你好，我是假模型。",
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 5, outputTokens: 9 },
      });
    });

    test("发出的请求：地址、API key、请求体", async () => {
      const { client, fake } = setup([textReply("ok")]);
      await client.complete({ ...HELLO, temperature: 0.5 });
      expect(fake.requests).toHaveLength(1);
      const [request] = fake.requests;
      expect(request?.url).toBe("https://fake.test/v1/chat/completions");
      expect(request?.method).toBe("POST");
      expect(request?.headers.authorization).toBe("Bearer sk-test");
      expect(request?.body).toMatchObject({ model: "fake-model", stream: true, temperature: 0.5 });
    });

    test("stream：数据到一块，产出一块", async () => {
      const { client } = setup([textReply("一二三四五", { delayMs: 20 })]);
      const start = performance.now();
      const times: number[] = [];
      const texts: string[] = [];
      for await (const event of client.stream(HELLO)) {
        if (event.type === "text") {
          texts.push(event.text);
          times.push(performance.now() - start);
        }
      }
      expect(texts).toEqual(["一", "二", "三", "四", "五"]);
      // 第一个字在第一个间隔之后就到了，而不是等全部 100ms
      expect(times[0]).toBeLessThan(80);
      expect(times.at(-1)).toBeGreaterThanOrEqual(80);
    });

    test("工具调用", async () => {
      const { client } = setup([
        toolCallReply([
          { id: "call_a", name: "get_weather", arguments: '{"city":"北京"}' },
          { id: "call_b", name: "add", arguments: '{"a":1,"b":2}' },
        ]),
      ]);
      const result = await client.complete(HELLO);
      expect(result.finishReason).toBe("tool_calls");
      expect(result.toolCalls).toEqual([
        { id: "call_a", name: "get_weather", arguments: '{"city":"北京"}' },
        { id: "call_b", name: "add", arguments: '{"a":1,"b":2}' },
      ]);
    });

    test("SSE 被切得很碎也没问题（每个 chunk 只有 3 个字节，汉字和换行都被切开）", async () => {
      const text = textReply("流式输出的中文").steps?.join("") ?? "";
      const bytes = new TextEncoder().encode(text);
      const fake = createFakeOpenAI([{ steps: [] }]);
      const client = createClient({
        ...BASE,
        fetch: async (url, init) => {
          await fake.fetch(url, init);
          const pieces: Uint8Array[] = [];
          for (let i = 0; i < bytes.length; i += 3) {
            pieces.push(bytes.slice(i, i + 3));
          }
          return new Response(
            new ReadableStream({
              start(controller) {
                for (const piece of pieces) {
                  controller.enqueue(piece);
                }
                controller.close();
              },
            }),
          );
        },
      });
      expect((await client.complete(HELLO)).text).toBe("流式输出的中文");
    });
  });

  describe("错误和重试", () => {
    test("400：抛出 ApiError，不重试", async () => {
      const { client, fake } = setup([
        errorReply(400, "messages 不能为空", { type: "invalid_request_error" }),
      ]);
      const error = await rejectionOf(client.complete(HELLO));
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(400);
      expect((error as ApiError).message).toContain("messages 不能为空");
      expect(fake.requests).toHaveLength(1);
    });

    test("500：重试，之后成功", async () => {
      const { client, fake, delays } = setup([errorReply(500, "内部错误"), textReply("好了")]);
      expect((await client.complete(HELLO)).text).toBe("好了");
      expect(fake.requests).toHaveLength(2);
      expect(delays).toHaveLength(1);
    });

    test("429 带 Retry-After：按服务器说的时间等待", async () => {
      const { client, delays } = setup([
        errorReply(429, "请求太频繁", { headers: { "Retry-After": "2" } }),
        textReply("好了"),
      ]);
      expect((await client.complete(HELLO)).text).toBe("好了");
      expect(delays).toEqual([2000]);
    });

    test("一直失败：重试 retries 次之后放弃，抛出最后一次的错误", async () => {
      const { client, fake } = setup(
        [errorReply(503, "一"), errorReply(503, "二"), errorReply(503, "三")],
        { retry: { retries: 2 } },
      );
      const error = await rejectionOf(client.complete(HELLO));
      expect((error as ApiError).message).toContain("三");
      expect(fake.requests).toHaveLength(3);
    });

    test("网络错误（fetch 本身失败）：重试", async () => {
      const fake = createFakeOpenAI([textReply("好了")]);
      let calls = 0;
      const client = createClient({
        ...BASE,
        retry: { sleep: async () => {} },
        fetch: async (url, init) => {
          calls++;
          if (calls === 1) {
            throw new TypeError("fetch failed", { cause: new Error("ECONNRESET") });
          }
          return fake.fetch(url, init);
        },
      });
      expect((await client.complete(HELLO)).text).toBe("好了");
      expect(calls).toBe(2);
    });

    test("流开始之后出错：直接抛出，不重试", async () => {
      const { client, fake } = setup(
        [
          {
            steps: [
              sse({ choices: [{ index: 0, delta: { content: "说到" } }] }),
              { fail: new TypeError("terminated") },
            ],
          },
          textReply("不应该用到"),
        ],
        { retry: { retries: 3 } },
      );
      const received: StreamEvent[] = [];
      const error = await rejectionOf(
        (async () => {
          for await (const event of client.stream(HELLO)) {
            received.push(event);
          }
        })(),
      );
      expect(error).toBeInstanceOf(TypeError);
      expect(received).toEqual([{ type: "text", text: "说到" }]);
      expect(fake.requests).toHaveLength(1);
    });

    test("流被截断（没有 finish_reason 也没有 [DONE]）：抛出", async () => {
      const { client } = setup([
        { steps: [sse({ choices: [{ index: 0, delta: { content: "说到" } }] })] },
      ]);
      await expect(client.complete(HELLO)).rejects.toThrow("响应流在完成之前就结束了");
    });
  });

  describe("超时", () => {
    test("等待响应头超时：抛出 TimeoutError", async () => {
      const { client } = setup([{ ...textReply("太慢了"), headersDelayMs: 1000 }], {
        timeoutMs: 30,
        retry: { retries: 0 },
      });
      const start = performance.now();
      const error = await rejectionOf(client.complete(HELLO));
      expect((error as Error).name).toBe("TimeoutError");
      expect(performance.now() - start).toBeLessThan(500);
    });

    test("等待响应头超时也会重试", async () => {
      const { client, fake } = setup(
        [{ ...textReply("太慢了"), headersDelayMs: 1000 }, textReply("快的")],
        {
          timeoutMs: 30,
        },
      );
      expect((await client.complete(HELLO)).text).toBe("快的");
      expect(fake.requests).toHaveLength(2);
    });

    test("timeoutMs 只限制等待响应头：响应头到了之后，流可以比它长得多", async () => {
      // 总共约 8 × 15 = 120ms，远超 timeoutMs 的 40ms
      const { client } = setup([textReply("这是一个很长的回答", { delayMs: 15 })], {
        timeoutMs: 40,
        retry: { retries: 0 },
      });
      expect((await client.complete(HELLO)).text).toBe("这是一个很长的回答");
    });

    test("两块数据之间间隔太久：抛出 TimeoutError，并断开连接", async () => {
      const { client, fake } = setup(
        [{ steps: [sse({ choices: [{ index: 0, delta: { content: "卡" } }] })], hang: true }],
        { idleTimeoutMs: 40 },
      );
      const received: string[] = [];
      const start = performance.now();
      const error = await rejectionOf(
        (async () => {
          for await (const event of client.stream(HELLO)) {
            if (event.type === "text") {
              received.push(event.text);
            }
          }
        })(),
      );
      expect((error as Error).name).toBe("TimeoutError");
      expect(received).toEqual(["卡"]);
      expect(performance.now() - start).toBeLessThan(500);
      expect(fake.requests[0]?.closedByClient).toBe(true);
    });
  });

  describe("取消", () => {
    test("开始前就已取消：立刻拒绝，不发请求", async () => {
      const { client, fake } = setup([textReply("x")]);
      const controller = new AbortController();
      const reason = new Error("用户取消");
      controller.abort(reason);
      expect(await rejectionOf(client.complete(HELLO, { signal: controller.signal }))).toBe(reason);
      expect(fake.requests).toHaveLength(0);
    });

    test("流的中途取消：以 signal.reason 拒绝，连接被断开", async () => {
      const { client, fake } = setup([textReply("一个很长很长的回答", { delayMs: 20 })]);
      const controller = new AbortController();
      const reason = new Error("用户按了 Ctrl+C");
      const received: string[] = [];
      const error = await rejectionOf(
        (async () => {
          for await (const event of client.stream(HELLO, { signal: controller.signal })) {
            if (event.type === "text") {
              received.push(event.text);
              if (received.length === 2) {
                controller.abort(reason);
              }
            }
          }
        })(),
      );
      expect(error).toBe(reason);
      expect(received).toEqual(["一", "个"]);
      expect(fake.requests[0]?.closedByClient).toBe(true);
    });

    test("等待重试时取消：立刻停止", async () => {
      const fake = createFakeOpenAI([errorReply(500, "坏了"), textReply("x")]);
      const client = createClient({
        ...BASE,
        fetch: fake.fetch,
        retry: { baseMs: 10_000, jitter: (ms) => ms },
      });
      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error("不等了")), 30);
      const start = performance.now();
      expect(await rejectionOf(client.complete(HELLO, { signal: controller.signal }))).toEqual(
        new Error("不等了"),
      );
      expect(performance.now() - start).toBeLessThan(1000);
      expect(fake.requests).toHaveLength(1);
    });

    test("消费者提前退出（break）：连接被断开", async () => {
      const { client, fake } = setup([textReply("一个很长很长的回答", { delayMs: 10 })]);
      for await (const event of client.stream(HELLO)) {
        if (event.type === "text") {
          break;
        }
      }
      await sleep(0);
      expect(fake.requests[0]?.closedByClient).toBe(true);
    });

    test("正常结束后不留下定时器", async () => {
      const countTimers = () =>
        process.getActiveResourcesInfo().filter((name) => name === "Timeout").length;
      const before = countTimers();
      const { client } = setup([textReply("x")], { timeoutMs: 60_000, idleTimeoutMs: 60_000 });
      await client.complete(HELLO);
      expect(countTimers()).toBe(before);
    });
  });

  test("真正的 HTTP：本机上的服务器 + 全局的 fetch", async () => {
    const script = textReply("来自本机服务器", { delayMs: 5 });
    let authorization: string | undefined;
    const server = createServer(async (request, response) => {
      authorization = request.headers.authorization;
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const step of script.steps ?? []) {
        if (typeof step === "string") {
          response.write(step);
        } else if ("delayMs" in step) {
          await sleep(step.delayMs);
        }
      }
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      const client = createClient({ ...BASE, baseUrl: `http://127.0.0.1:${port}/v1` });
      expect((await client.complete(HELLO)).text).toBe("来自本机服务器");
      expect(authorization).toBe("Bearer sk-test");
    } finally {
      server.close();
    }
  });
});
