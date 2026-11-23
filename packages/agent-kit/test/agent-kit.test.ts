// @learn-ts/agent-kit 的测试：只通过包名导入，像使用者一样测试公开接口。
// 各个函数的细节已经由第 2、3 章的练习测试覆盖，这里关注"包"这一层：导出了什么、组合起来能不能用。

import * as kit from "@learn-ts/agent-kit";
import { createClient, createRegistry, defineTool, type ChatResult } from "@learn-ts/agent-kit";
import { createFakeOpenAI, textReply, toolCallReply } from "@learn-ts/agent-kit/testing";
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
      "attemptAsync",
      "backoffDelay",
      "batch",
      "collect",
      "createClient",
      "createRegistry",
      "defineTool",
      "errorFromResponse",
      "estimateCost",
      "formatErrorChain",
      "fullJitter",
      "idleTimeout",
      "isAbortError",
      "isRetryable",
      "isTimeoutError",
      "mapAsync",
      "parseRetryAfter",
      "parseSse",
      "raceAbort",
      "readSse",
      "retry",
      "take",
      "toError",
      "toSchema",
      "totalTokens",
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

  test("主入口不依赖 zod：只用主入口的使用者不需要安装它", async () => {
    const { readFileSync } = await import("node:fs");
    const sources = ["client.ts", "registry.ts", "index.ts"].map((file) =>
      readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"),
    );
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
