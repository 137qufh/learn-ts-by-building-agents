// @learn-ts/agent-kit 的测试：只通过包名导入，像使用者一样测试公开接口。
// 各个函数的细节已经由各章的练习测试覆盖，这里关注"包"这一层：导出了什么、组合起来能不能用。

import * as kit from "@learn-ts/agent-kit";
import {
  createAgent,
  createClient,
  createRecordingTracer,
  createRegistry,
  defineTool,
  requireApproval,
  type AgentEvent,
  type ChatResult,
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
      "compose",
      "createAgent",
      "createChannel",
      "createClient",
      "createRecordingTracer",
      "createRegistry",
      "defineTool",
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
      "messageTokens",
      "noopTracer",
      "parseRetryAfter",
      "parseSse",
      "raceAbort",
      "readSse",
      "redact",
      "repairHistory",
      "requireApproval",
      "retry",
      "runToolCalls",
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

  test("主入口不依赖 zod：只用主入口的使用者不需要安装它", async () => {
    const { globSync, readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const src = fileURLToPath(new URL("../src/", import.meta.url));
    const files = globSync("**/*.ts", { cwd: src }).filter((file) => !file.startsWith("zod"));
    expect(files).toContain("agent/agent.ts");
    const sources = files.map((file) => readFileSync(`${src}/${file}`, "utf8"));
    for (const source of sources) {
      expect(source).not.toMatch(/from "zod"/);
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
