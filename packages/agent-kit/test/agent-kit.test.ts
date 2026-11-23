// @learn-ts/agent-kit 的测试：只通过包名导入，像使用者一样测试公开接口。
// 各个函数的细节已经由第 2、3 章的练习测试覆盖，这里关注"包"这一层：导出了什么、组合起来能不能用。

import * as kit from "@learn-ts/agent-kit";
import { createClient, createRegistry, defineTool, type ChatResult } from "@learn-ts/agent-kit";
import { createFakeOpenAI, textReply, toolCallReply } from "@learn-ts/agent-kit/testing";
import { describe, expect, expectTypeOf, test } from "vitest";

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
