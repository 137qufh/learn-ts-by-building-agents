// @learn-ts/agent-kit 的测试：只通过包名导入，像使用者一样测试公开接口。
// 各个函数的细节已经由各章的练习测试覆盖，这里关注"包"这一层：导出了什么、组合起来能不能用。

import * as kit from "@learn-ts/agent-kit";
import {
  compareBaseline,
  createAgent,
  createClient,
  createMcpExecutor,
  createRecordingTracer,
  createRegistry,
  defineTool,
  delegate,
  mergeTools,
  parentSummary,
  parseJudge,
  requireApproval,
  runEval,
  shareContext,
  type AgentEvent,
  type ChatResult,
  type McpToolSource,
} from "@learn-ts/agent-kit";
import * as kitTesting from "@learn-ts/agent-kit/testing";
import {
  createFakeOpenAI,
  createScriptedModel,
  textReply,
  toolCallReply,
} from "@learn-ts/agent-kit/testing";
import * as kitZod from "@learn-ts/agent-kit/zod";
import { createToolbox, defineTool as defineZodTool } from "@learn-ts/agent-kit/zod";
import { describe, expect, expectTypeOf, test } from "vitest";
import { z } from "zod";

describe("公开接口", () => {
  test("导出的值（增删任何一个都是有意的决定，要同步修改这里和版本号）", () => {
    expect(Object.keys(kit).sort()).toEqual([
      "ApiError",
      "abortableSleep",
      "addUsage",
      "assistantMessage",
      "attemptAsync",
      "backoffDelay",
      "batch",
      "collect",
      "collectTurn",
      "compactMessages",
      "compareBaseline",
      "compose",
      "cosine",
      "createAgent",
      "createChannel",
      "createClient",
      "createLocalEmbedder",
      "createMcpExecutor",
      "createMemoryStore",
      "createRecordingTracer",
      "createRegistry",
      "createRetriever",
      "defineTool",
      "delegate",
      "dispatchEvent",
      "errorFromResponse",
      "estimateCost",
      "estimateTokens",
      "fitToBudget",
      "formatErrorChain",
      "fullJitter",
      "groupTurns",
      "idleTimeout",
      "isAbortError",
      "isRetryable",
      "isSecretKey",
      "isTimeoutError",
      "mapAsync",
      "mergeTools",
      "messageTokens",
      "noopTracer",
      "orchestrate",
      "parentSummary",
      "parseJudge",
      "parseRetryAfter",
      "parseSse",
      "raceAbort",
      "readSse",
      "redact",
      "repairHistory",
      "requireApproval",
      "retry",
      "runEval",
      "runToolCalls",
      "shareContext",
      "take",
      "toError",
      "toJsonLine",
      "toSchema",
      "totalTokens",
      "traced",
      "truncateMiddle",
      "validateArgs",
      "withTimeout",
    ]);
  });

  test("@learn-ts/agent-kit/zod 导出的值（0.2.0 新增的入口）", () => {
    expect(Object.keys(kitZod).sort()).toEqual([
      "createToolbox",
      "defineFunction",
      "defineTool",
      "extractJson",
      "feedbackFor",
      "formatPath",
      "generateValidated",
      "issuesForModel",
      "parseToolArguments",
      "strictFunction",
      "strictProblems",
      "toContent",
      "toolParameters",
    ]);
  });

  test("@learn-ts/agent-kit/testing 导出的值（0.3.0 加入了 createScriptedModel）", () => {
    expect(Object.keys(kitTesting).sort()).toEqual([
      "DONE",
      "createFakeOpenAI",
      "createScriptedModel",
      "errorReply",
      "sse",
      "textReply",
      "toolCallReply",
    ]);
  });

  test("主入口不依赖 zod，也不依赖 MCP SDK", async () => {
    const { globSync, readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const src = fileURLToPath(new URL("../src/", import.meta.url));
    const files = globSync("**/*.ts", { cwd: src }).filter((file) => !file.startsWith("zod"));
    expect(files).toContain("agent/agent.ts");
    const sources = files.map((file) => readFileSync(`${src}/${file}`, "utf8"));
    for (const source of sources) {
      expect(source).not.toMatch(/from ["']zod["']/);
      expect(source).not.toMatch(/from ["']@modelcontextprotocol\//);
    }
  });

  test("内部实现没有泄露出来", () => {
    expect(kit).not.toHaveProperty("parseChunk");
    expect(kit).not.toHaveProperty("buildRequest");
    expect(kit).not.toHaveProperty("createToolCallAccumulator");
  });
});

describe("注册表 + 客户端", () => {
  const weather = defineTool({
    name: "get_weather",
    description: "查询城市的天气",
    parameters: { city: { type: "string", description: "城市名" } },
    execute: ({ city }) => `${city}：晴，25°C`,
  });
  const registry = createRegistry().register(weather);

  test("模型请求调用工具 → 注册表执行 → 结果", async () => {
    const fake = createFakeOpenAI([
      toolCallReply([{ id: "call_1", name: "get_weather", arguments: '{"city":"北京"}' }]),
    ]);
    const client = createClient({
      baseUrl: "https://fake.test/v1",
      apiKey: "k",
      model: "m",
      fetch: fake.fetch,
    });

    const result = await client.complete({
      messages: [{ role: "user", content: "北京天气？" }],
      tools: registry.schemas(),
    });
    expectTypeOf(result).toEqualTypeOf<ChatResult>();

    const [call] = result.toolCalls;
    expect(call).toBeDefined();
    if (call === undefined) return;
    expect(registry.dispatch(call)).toEqual({ id: "call_1", ok: true, value: "北京：晴，25°C" });

    // 工具的描述随请求发给了模型
    const body = fake.requests[0]?.body as { tools?: { function: { name: string } }[] };
    expect(body.tools?.map((tool) => tool.function.name)).toEqual(["get_weather"]);
  });

  test("流式输出", async () => {
    const fake = createFakeOpenAI([textReply("你好，世界")]);
    const client = createClient({
      baseUrl: "https://fake.test/v1",
      apiKey: "k",
      model: "m",
      fetch: fake.fetch,
    });
    const texts: string[] = [];
    for await (const event of client.stream({ messages: [{ role: "user", content: "hi" }] })) {
      if (event.type === "text") texts.push(event.text);
    }
    expect(texts.join("")).toBe("你好，世界");
  });

  test("类型：工具参数从描述推断出来", () => {
    expectTypeOf<Parameters<typeof registry.call>[1]>().toEqualTypeOf<{ city: string }>();
  });
});

describe("Zod 工具箱 + 客户端（0.2.0）", () => {
  const weather = defineZodTool({
    name: "get_weather",
    description: "查询城市的天气",
    strict: true,
    parameters: z.object({
      city: z.string().min(1).describe("城市名"),
      unit: z
        .enum(["c", "f"])
        .nullable()
        .transform((unit) => unit ?? "c"),
    }),
    execute: ({ city, unit }) => `${city}：晴，25°${unit.toUpperCase()}`,
  });
  const tools = createToolbox([weather]);

  test("schemas 可以直接作为请求的 tools；模型的调用经过校验后执行", async () => {
    const fake = createFakeOpenAI([
      toolCallReply([
        { id: "call_1", name: "get_weather", arguments: '{"city":"北京","unit":null}' },
        { id: "call_2", name: "get_weather", arguments: '{"city":""}' },
      ]),
    ]);
    const client = createClient({
      baseUrl: "https://fake.test/v1",
      apiKey: "k",
      model: "m",
      fetch: fake.fetch,
    });

    const result = await client.complete({
      messages: [{ role: "user", content: "北京天气？" }],
      tools: tools.schemas(),
    });
    const results = await Promise.all(result.toolCalls.map((call) => tools.dispatch(call)));
    expect(results[0]).toEqual({ id: "call_1", ok: true, content: "北京：晴，25°C" });
    expect(results[1]?.ok).toBe(false);
    expect(results[1]?.content).toMatch(/^参数不符合要求：/);

    const body = fake.requests[0]?.body as {
      tools?: {
        function: { name: string; strict?: boolean; parameters: { required?: string[] } };
      }[];
    };
    expect(body.tools?.[0]?.function).toMatchObject({
      name: "get_weather",
      strict: true,
      parameters: { required: ["city", "unit"], additionalProperties: false },
    });
  });

  test("类型：call 的参数是 schema 的输入类型", () => {
    expectTypeOf<Parameters<typeof tools.call<"get_weather">>[1]>().toEqualTypeOf<{
      city: string;
      unit: "c" | "f" | null;
    }>();
  });
});

describe("agent harness（0.3.0）", () => {
  const weather = defineZodTool({
    name: "get_weather",
    description: "查询天气",
    parameters: z.object({ city: z.string().min(1) }),
    execute: ({ city }) => `${city}：晴`,
  });
  const save = defineZodTool({
    name: "save_note",
    description: "保存笔记",
    parameters: z.object({ text: z.string() }),
    execute: ({ text }) => `已保存：${text}`,
  });

  test("Toolbox + 假服务器上的真客户端：完整地走过 HTTP、SSE、校验、工具、中间件", async () => {
    const fake = createFakeOpenAI([
      toolCallReply([{ id: "c1", name: "get_weather", arguments: '{"city":""}' }]),
      toolCallReply([
        { id: "c2", name: "get_weather", arguments: '{"city":"北京"}' },
        { id: "c3", name: "save_note", arguments: '{"text":"带伞"}' },
      ]),
      textReply("北京晴，不用带伞。"),
    ]);
    const client = createClient({
      baseUrl: "https://fake.test/v1",
      apiKey: "k",
      model: "m",
      fetch: fake.fetch,
    });
    const tracer = createRecordingTracer();
    const agent = createAgent({
      model: client,
      tools: createToolbox([weather, save]),
      system: "你是天气助手",
      middleware: [requireApproval(["save_note"], () => false)],
      tracer,
    });
    const run = agent.run("北京要带伞吗？");
    const types: AgentEvent["type"][] = [];
    for await (const event of run) types.push(event.type);
    const result = await run.result;

    expect(result.stopReason).toEqual({ type: "completed" });
    expect(result.text).toBe("北京晴，不用带伞。");
    const toolMessages = result.messages.filter((m) => m.role === "tool").map((m) => m.content);
    expect(toolMessages[0]).toMatch(/^参数不符合要求/); // 第一次参数不合格，模型改正了
    expect(toolMessages.slice(1)).toEqual([
      "北京：晴",
      "用户拒绝了这次 save_note 调用。不要重试同样的操作，换一种做法或者直接回答。",
    ]);
    expect(fake.requests).toHaveLength(3);
    expect(fake.requests[0]?.body).toMatchObject({
      tools: [{ type: "function" }, { type: "function" }],
    });
    expect(types.at(-1)).toBe("done");
    expect(tracer.spans.filter((s) => s.name.startsWith("tool "))).toHaveLength(3);
  });

  test("createScriptedModel 不经过 HTTP，直接驱动 harness", async () => {
    const model = createScriptedModel([
      { toolCalls: [{ name: "get_weather", arguments: { city: "上海" } }] },
      { text: "上海晴" },
    ]);
    const result = await createAgent({ model, tools: createToolbox([weather]) }).run("上海？")
      .result;
    expect(result.messages.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(model.requests[1]?.messages.at(-1)).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: "上海：晴",
    });
  });

  test("类型：LlmClient 和 Toolbox 直接符合 harness 需要的接口", () => {
    expectTypeOf(createClient).returns.toExtend<Parameters<typeof createAgent>[0]["model"]>();
    expectTypeOf(createToolbox([weather])).toExtend<
      NonNullable<Parameters<typeof createAgent>[0]["tools"]>
    >();
  });
});

describe("MCP、多 agent、记忆和评测（0.4.0）", () => {
  test("官方 Client 能直接交给 createMcpExecutor，工具进入 harness", async () => {
    const { Client, InMemoryTransport } = await import("@modelcontextprotocol/client");
    const { McpServer } = await import("@modelcontextprotocol/server");
    const { z: zod } = await import("zod");
    const notes: string[] = [];
    const server = new McpServer({ name: "notes", version: "1.0.0" });
    server.registerTool(
      "add_note",
      {
        description: "保存笔记",
        inputSchema: zod.object({ text: zod.string().min(1) }),
      },
      async ({ text }) => {
        notes.push(text);
        return { content: [{ type: "text" as const, text: `已保存 ${notes.length}` }] };
      },
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "agent-kit", version: "0.4.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    expectTypeOf(client).toExtend<McpToolSource>();

    try {
      const mcp = await createMcpExecutor(client, { prefix: "notes" });
      const remember = {
        schemas: () => [
          {
            name: "remember",
            description: "记住一条事实",
            parameters: {
              type: "object",
              properties: { text: { type: "string" } },
              required: ["text"],
            },
          },
        ],
        async dispatch(call: { id: string; name: string; arguments: string }) {
          return { id: call.id, ok: true, content: `记住了 ${call.arguments}` };
        },
      };
      const tools = mergeTools([mcp, remember]);
      const model = createScriptedModel([
        {
          toolCalls: [
            { name: "notes__add_note", arguments: { text: "买牛奶" } },
            { name: "remember", arguments: { text: "用户要低脂" } },
          ],
        },
        { text: "记好了" },
      ]);
      const result = await createAgent({ model, tools }).run("记下买牛奶").result;
      expect(result.stopReason).toEqual({ type: "completed" });
      expect(result.text).toBe("记好了");
      expect(notes).toEqual(["买牛奶"]);
      const toolMessages = result.messages.filter((message) => message.role === "tool");
      expect(toolMessages.map((message) => message.content)).toEqual([
        "已保存 1",
        '记住了 {"text":"用户要低脂"}',
      ]);
      expect(client.getNegotiatedProtocolVersion()).toBe("2025-11-25");
    } finally {
      await client.close();
      await server.close();
    }
  });

  test("子 agent 看不到父对话；密钥进不了共享上下文", async () => {
    const child = createScriptedModel([{ text: "两瓶低脂" }]);
    const agent = createAgent({ model: child, system: "用一句话总结" });
    const shared = shareContext(
      { note: "买牛奶", apiKey: "sk-secret", inputTokens: "12", userId: "u1" },
      { allow: ["note", "apiKey", "inputTokens", "userId"], deny: ["userId"] },
    );
    expect(shared).toEqual({ note: "买牛奶", inputTokens: "12" });
    const note = shared["note"];
    if (note === undefined) throw new Error("note 应该在共享上下文里");
    const result = await delegate(agent, "总结购物", { context: note });
    expect(parentSummary(result)).toBe("两瓶低脂");
    expect(child.requests[0]?.messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(JSON.stringify(child.requests[0]?.messages)).not.toContain("sk-secret");
    expect(child.requests[0]?.messages[1]).toMatchObject({
      role: "user",
      content: "背景：\n买牛奶\n\n任务：\n总结购物",
    });
  });

  test("评测失败会留下原因，分数下降会对照基线报回归", async () => {
    const report = await runEval([
      {
        name: "通过",
        expect: { textIncludes: ["牛奶"], tools: ["add"] },
        run: () =>
          Promise.resolve({
            text: "买了牛奶",
            tools: ["add"],
            transcript: [{ role: "assistant", text: "买了牛奶", tools: [] }],
          }),
      },
      {
        name: "失败",
        expect: { textEquals: "没有" },
        run: () => Promise.reject(new Error("模型超时")),
      },
    ]);
    expect(report.passed).toBe(1);
    expect(report.failed).toEqual([{ name: "失败", reasons: ["运行抛出了错误：模型超时"] }]);

    const judged = parseJudge(
      '说明\n```json\n{"scores":[{"criterion":"准确","score":2,"reason":"对了"}]}\n```',
      ["准确"],
    );
    expect(judged).toEqual({
      ok: true,
      scores: [{ criterion: "准确", score: 2, reason: "对了" }],
      mean: 2,
    });
    expect(compareBaseline([{ name: "总结", mean: 1 }], [{ name: "总结", mean: 2 }], 0.5)).toEqual({
      ok: false,
      regressions: [{ name: "总结", before: 2, after: 1, delta: -1 }],
      missing: [],
    });
  });
});
