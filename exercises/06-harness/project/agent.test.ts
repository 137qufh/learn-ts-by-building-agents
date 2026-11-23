import type { Message, RawToolCall } from "@learn-ts/agent-kit";
import { createScriptedModel, type ScriptStep } from "@learn-ts/agent-kit/testing";
import { describe, expect, test, vi } from "vitest";
import type { ToolExecutor } from "../01-agent-loop.ts";
import type { AgentEvent } from "../06-event-stream.ts";
import { createRecordingTracer } from "../08-tracing.ts";
import { NO_TOOLS, createAgent, repeatedContent, type AgentOptions } from "./agent.ts";

/** 假的工具：echo 原样返回；slow 等 ms 毫秒；fail 报告失败；big 返回很长的文本 */
function fakeTools(log: string[] = []): ToolExecutor {
  return {
    schemas: () => [{ name: "echo", description: "原样返回", parameters: { type: "object" } }],
    async dispatch(call, options = {}) {
      log.push(call.name);
      const args = JSON.parse(call.arguments) as { text?: string; ms?: number };
      if (call.name === "slow") {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, args.ms ?? 1000);
          options.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(options.signal?.reason as Error);
          });
        });
        return { id: call.id, ok: true, content: "slow done" };
      }
      if (call.name === "fail") return { id: call.id, ok: false, content: "工具报告失败" };
      if (call.name === "big") return { id: call.id, ok: true, content: "x".repeat(100) };
      return { id: call.id, ok: true, content: args.text ?? "" };
    },
  };
}

async function drain(run: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of run) events.push(event);
  return events;
}

const echo = (text: string, id?: string) => ({
  name: "echo",
  arguments: { text },
  ...(id === undefined ? {} : { id }),
});

function agentWith(steps: ScriptStep[], options: Partial<AgentOptions> = {}) {
  const model = createScriptedModel(steps);
  const agent = createAgent({ model, tools: fakeTools(), ...options });
  return { model, agent };
}

describe("createAgent：基本的循环", () => {
  test("一问一答：消息、文本、步数、用量、停止原因", async () => {
    const { agent, model } = agentWith(
      [
        {
          text: "我查一下",
          toolCalls: [echo("北京晴")],
          usage: { inputTokens: 10, outputTokens: 5 },
        },
        { text: "北京今天晴。", usage: { inputTokens: 20, outputTokens: 4 } },
      ],
      { system: "你是助手" },
    );
    const result = await agent.run("北京天气？").result;
    expect(result.stopReason).toEqual({ type: "completed" });
    expect(result.text).toBe("北京今天晴。");
    expect(result.steps).toBe(2);
    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 9 });
    expect(result.messages).toEqual([
      { role: "system", content: "你是助手" },
      { role: "user", content: "北京天气？" },
      {
        role: "assistant",
        content: "我查一下",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "echo", arguments: '{"text":"北京晴"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "北京晴" },
      { role: "assistant", content: "北京今天晴。" },
    ]);
    expect(model.requests[0]?.tools?.map((t) => t.name)).toEqual(["echo"]);
    expect(model.requests[1]?.messages).toHaveLength(4);
  });

  test("history：接着之前的对话；已经有 system 消息时不再加一条", async () => {
    const { agent, model } = agentWith([{ text: "第二个回答" }], { system: "你是助手" });
    const history: Message[] = [
      { role: "system", content: "旧的系统提示" },
      { role: "user", content: "第一个问题" },
      { role: "assistant", content: "第一个回答" },
    ];
    const result = await agent.run("第二个问题", { history }).result;
    expect(result.messages.map((m) => m.content)).toEqual([
      "旧的系统提示",
      "第一个问题",
      "第一个回答",
      "第二个问题",
      "第二个回答",
    ]);
    expect(model.requests[0]?.messages).toHaveLength(4);
    expect(history).toHaveLength(3); // 不修改传入的数组
  });

  test("没有 tools：请求里不带 tools；模型还是调用了工具时，告诉它没有可用的工具", async () => {
    const model = createScriptedModel([{ toolCalls: [echo("x")] }, { text: "好吧" }]);
    const result = await createAgent({ model }).run("hi").result;
    expect("tools" in (model.requests[0] ?? {})).toBe(false);
    expect(result.messages[2]).toEqual({ role: "tool", tool_call_id: "call_1", content: NO_TOOLS });
    expect(NO_TOOLS).toBe("没有可用的工具");
  });

  test("temperature 和 maxTokens 传给模型", async () => {
    const { agent, model } = agentWith([{ text: "ok" }], { temperature: 0, maxTokens: 50 });
    await agent.run("hi").result;
    expect(model.requests[0]).toMatchObject({ temperature: 0, maxTokens: 50 });
  });

  test("一个 agent 可以同时跑多次，互不影响", async () => {
    const model = createScriptedModel([{ text: "A" }, { text: "B" }]);
    const agent = createAgent({ model });
    const [a, b] = await Promise.all([agent.run("1").result, agent.run("2").result]);
    expect(a.messages).toHaveLength(2);
    expect(b.messages).toHaveLength(2);
  });
});

describe("事件流", () => {
  test("事件的顺序：step_start → text → tool_call → model_end → tool_result → … → done", async () => {
    const { agent } = agentWith([{ text: "abcdef", toolCalls: [echo("e")] }, { text: "ok" }]);
    const run = agent.run("hi");
    const events = await drain(run);
    expect(events.map((e) => e.type)).toEqual([
      "step_start",
      "text",
      "text",
      "tool_call",
      "model_end",
      "tool_result",
      "step_start",
      "text",
      "model_end",
      "done",
    ]);
    const done = events.at(-1);
    expect(done?.type === "done" && done.result).toEqual(await run.result);
    const toolResult = events.find((e) => e.type === "tool_result");
    expect(toolResult).toMatchObject({
      step: 1,
      result: { id: "call_1", name: "echo", ok: true, status: "ok", content: "e" },
    });
  });

  test("不遍历事件也能拿到结果", async () => {
    const { agent } = agentWith([{ text: "ok" }]);
    expect((await agent.run("hi").result).text).toBe("ok");
  });
});

describe("工具执行", () => {
  test("同一步的多个调用并行执行，结果按调用的顺序追加", async () => {
    const model = createScriptedModel([
      {
        toolCalls: [
          { name: "slow", arguments: { ms: 30 } },
          { name: "echo", arguments: { text: "fast" } },
        ],
      },
      { text: "done" },
    ]);
    const started = performance.now();
    const events = await drain(createAgent({ model, tools: fakeTools() }).run("go"));
    expect(performance.now() - started).toBeLessThan(500);
    const results = events.flatMap((e) => (e.type === "tool_result" ? [e.result.name] : []));
    expect(results).toEqual(["echo", "slow"]); // 完成的顺序
    const done = events.at(-1);
    const toolMessages =
      done?.type === "done" ? done.result.messages.filter((m) => m.role === "tool") : [];
    expect(toolMessages.map((m) => m.content)).toEqual(["slow done", "fast"]); // 调用的顺序
  });

  test("maxParallelTools 限制并发", async () => {
    const log: string[] = [];
    let running = 0;
    let peak = 0;
    const tools: ToolExecutor = {
      schemas: () => [],
      async dispatch(call) {
        log.push(call.id);
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
        return { id: call.id, ok: true, content: "" };
      },
    };
    const model = createScriptedModel([
      { toolCalls: [echo("1"), echo("2"), echo("3")] },
      { text: "ok" },
    ]);
    await createAgent({ model, tools, maxParallelTools: 1 }).run("go").result;
    expect(peak).toBe(1);
    expect(log).toEqual(["call_1", "call_2", "call_3"]);
  });

  test("工具超时：得到超时的结果，循环继续", async () => {
    const { agent } = agentWith(
      [{ toolCalls: [{ name: "slow", arguments: { ms: 5000 } }] }, { text: "超时了" }],
      {
        toolTimeoutMs: 20,
      },
    );
    const result = await agent.run("go").result;
    expect(result.messages[2]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: "工具 slow 超过 20ms 没有完成，已停止",
    });
    expect(result.stopReason).toEqual({ type: "completed" });
  });

  test("工具的结果太长时截断", async () => {
    const { agent } = agentWith([{ toolCalls: [{ name: "big" }] }, { text: "ok" }], {
      maxToolResultChars: 10,
    });
    const result = await agent.run("go").result;
    expect(result.messages[2]?.content).toBe(
      `${"x".repeat(5)}\n…（中间省略了 90 个字符）…\n${"x".repeat(5)}`,
    );
  });
});

describe("停止条件", () => {
  test("达到 maxSteps：最后一步的工具也执行了，记录是完整的", async () => {
    const steps = Array.from({ length: 5 }, (_, i) => ({ toolCalls: [echo(String(i))] }));
    const { agent } = agentWith(steps, { maxSteps: 2 });
    const result = await agent.run("go").result;
    expect(result.stopReason).toEqual({ type: "max_steps", maxSteps: 2 });
    expect(result.steps).toBe(2);
    expect(result.messages.filter((m) => m.role === "tool")).toHaveLength(2);
    expect(result.messages.at(-1)?.role).toBe("tool");
  });

  test("默认最多 20 步", async () => {
    const steps = Array.from({ length: 21 }, (_, i) => ({ toolCalls: [echo(String(i))] }));
    expect((await agentWith(steps).agent.run("go").result).steps).toBe(20);
  });

  test("finish_reason 是 length：停下，保留截断的文本，没执行的调用补上说明", async () => {
    const { agent } = agentWith([
      { text: "写到一半", toolCalls: [echo("x")], finishReason: "length" },
    ]);
    const result = await agent.run("go").result;
    expect(result.stopReason).toEqual({ type: "length" });
    expect(result.text).toBe("写到一半");
    expect(result.messages.at(-1)).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: "（没有结果：运行在这次调用完成之前就结束了）",
    });
  });

  test("content_filter：模型停下了", async () => {
    const { agent } = agentWith([{ text: "", finishReason: "content_filter" }]);
    expect((await agent.run("go").result).stopReason).toEqual({
      type: "model_stopped",
      finishReason: "content_filter",
    });
  });

  test("同样的调用连续出现 repeatLimit 次：停下，最后一次不执行", async () => {
    const log: string[] = [];
    const model = createScriptedModel(
      Array.from({ length: 5 }, () => ({ toolCalls: [echo("same")] })),
    );
    const result = await createAgent({ model, tools: fakeTools(log), repeatLimit: 3 }).run("go")
      .result;
    expect(result.stopReason).toEqual({ type: "repeated_tool_calls", name: "echo", times: 3 });
    expect(result.steps).toBe(3);
    expect(log).toHaveLength(2);
    expect(result.messages.at(-1)).toEqual({
      role: "tool",
      tool_call_id: "call_3",
      content: repeatedContent(3),
    });
    expect(repeatedContent(3)).toBe(
      "没有执行：同样的调用已经连续出现了 3 次，harness 停止了这次运行",
    );
  });
});

describe("错误恢复", () => {
  test("流中途出错：整步重试一次（默认），重试前发出 step_retry", async () => {
    const { agent, model } = agentWith([
      { fail: new Error("连接断开"), afterText: "说到" },
      { text: "完整的回答" },
    ]);
    const run = agent.run("go");
    const events = await drain(run);
    const result = await run.result;
    expect(result.stopReason).toEqual({ type: "completed" });
    expect(result.messages.at(-1)).toEqual({ role: "assistant", content: "完整的回答" }); // 不包含失败那次的半截文本
    expect(result.steps).toBe(1);
    expect(model.requests).toHaveLength(2);
    const retry = events.find((e) => e.type === "step_retry");
    expect(retry).toMatchObject({ step: 1, attempt: 1, error: { message: "连接断开" } });
  });

  test("重试次数用完：停下，停止原因里有错误", async () => {
    const boom = new Error("一直坏");
    const { agent } = agentWith([{ fail: boom }, { fail: boom }, { fail: boom }], {
      modelRetries: 2,
    });
    const result = await agent.run("go").result;
    expect(result.stopReason).toEqual({ type: "error", error: boom });
    expect(result.messages).toEqual([{ role: "user", content: "go" }]);
  });

  test("modelRetries: 0 时不重试", async () => {
    const { agent, model } = agentWith([{ fail: new Error("x") }, { text: "不会用到" }], {
      modelRetries: 0,
    });
    expect((await agent.run("go").result).stopReason.type).toBe("error");
    expect(model.requests).toHaveLength(1);
  });

  test("中间件抛出的意外错误也变成结果，不会让 result 拒绝", async () => {
    const boom = new Error("中间件坏了");
    const { agent } = agentWith([{ text: "x" }], {
      middleware: [
        {
          name: "bad",
          beforeModel: () => {
            throw boom;
          },
        },
      ],
    });
    const result = await agent.run("go").result;
    expect(result.stopReason).toEqual({ type: "error", error: boom });
  });
});

describe("取消", () => {
  test("模型输出到一半时取消：已经输出的文字留在记录里", async () => {
    const model = createScriptedModel([{ text: "一二三四五六七八九十" }], {
      chunkSize: 1,
      delayMs: 5,
    });
    const controller = new AbortController();
    const run = createAgent({ model }).run("数数", { signal: controller.signal });
    const seen: string[] = [];
    for await (const event of run) {
      if (event.type === "text") {
        seen.push(event.text);
        if (seen.length === 3) controller.abort();
      }
    }
    const result = await run.result;
    expect(result.stopReason).toEqual({ type: "cancelled" });
    expect(result.messages.at(-1)).toEqual({ role: "assistant", content: "一二三" });
  });

  test("工具执行中取消：每个调用都有结果（取消的写明已取消），停止原因是 cancelled", async () => {
    const controller = new AbortController();
    const model = createScriptedModel([
      { toolCalls: [echo("fast"), { name: "slow", arguments: { ms: 5000 } }] },
    ]);
    const run = createAgent({ model, tools: fakeTools() }).run("go", { signal: controller.signal });
    for await (const event of run) {
      if (event.type === "tool_result") controller.abort();
    }
    const result = await run.result;
    expect(result.stopReason).toEqual({ type: "cancelled" });
    expect(result.messages.filter((m) => m.role === "tool").map((m) => m.content)).toEqual([
      "fast",
      "已取消：这次运行被中断了，工具没有执行完",
    ]);
  });

  test("一开始就取消了：不调用模型", async () => {
    const controller = new AbortController();
    controller.abort();
    const { agent, model } = agentWith([{ text: "x" }]);
    const result = await agent.run("go", { signal: controller.signal }).result;
    expect(result.stopReason).toEqual({ type: "cancelled" });
    expect(model.requests).toHaveLength(0);
  });
});

describe("上下文预算", () => {
  test("超出 contextTokens 时，发给模型的是省略后的记录，完整的记录仍然保留", async () => {
    const history: Message[] = Array.from({ length: 10 }, (_, i): Message => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "很长的一句话".repeat(10),
    }));
    const { agent, model } = agentWith([{ text: "ok" }], { contextTokens: 200, system: "sys" });
    const run = agent.run("新问题", { history });
    const events = await drain(run);
    const sent = model.requests[0]?.messages ?? [];
    expect(sent[0]).toEqual({ role: "system", content: "sys" });
    expect(sent[1]?.content).toMatch(/已经省略/);
    expect(sent.at(-1)).toEqual({ role: "user", content: "新问题" });
    expect(sent.length).toBeLessThan(12);
    expect((await run.result).messages).toHaveLength(13);
    expect(events.find((e) => e.type === "context_trimmed")).toMatchObject({ step: 1 });
  });
});

describe("中间件", () => {
  test("beforeModel 可以修改请求；wrapToolCall 可以拦截工具；afterStep 可以停下", async () => {
    const seen: RawToolCall[] = [];
    const { agent, model } = agentWith(
      [{ toolCalls: [echo("a")] }, { toolCalls: [echo("b")] }, { text: "不会到这里" }],
      {
        middleware: [
          { name: "temp", beforeModel: (request) => ({ ...request, temperature: 0.5 }) },
          {
            name: "spy",
            wrapToolCall: async (invocation, next) => {
              seen.push(invocation.call);
              const outcome = await next(invocation);
              return { ...outcome, content: `[${outcome.content}]` };
            },
          },
          {
            name: "two-steps",
            afterStep: ({ step }) => (step >= 2 ? { stop: "够了" } : undefined),
          },
        ],
      },
    );
    const result = await agent.run("go").result;
    expect(model.requests[0]?.temperature).toBe(0.5);
    expect(seen.map((c) => c.id)).toEqual(["call_1", "call_2"]);
    expect(result.messages[2]?.content).toBe("[a]");
    expect(result.stopReason).toEqual({
      type: "stopped_by_middleware",
      middleware: "two-steps",
      reason: "够了",
    });
  });

  test("给钩子的 messages 是副本：存起来之后不会跟着主循环变化", async () => {
    const seen: (readonly Message[])[] = [];
    const { agent } = agentWith([{ toolCalls: [echo("a")] }, { text: "ok" }], {
      middleware: [{ name: "spy", beforeModel: (_, info) => void seen.push(info.messages) }],
    });
    await agent.run("go").result;
    expect(seen.map((messages) => messages.length)).toEqual([1, 3]);
  });

  test("afterStep 拿到的是包含这一步工具结果的记录", async () => {
    const afterStep = vi.fn(() => undefined);
    const { agent } = agentWith([{ toolCalls: [echo("a")] }, { text: "ok" }], {
      middleware: [{ name: "spy", afterStep }],
    });
    await agent.run("go").result;
    expect(afterStep).toHaveBeenCalledTimes(1); // 没有工具调用的最后一步已经结束了循环
    const [info] = afterStep.mock.calls[0] as unknown as [{ step: number; messages: Message[] }];
    expect(info.step).toBe(1);
    expect(info.messages.at(-1)).toMatchObject({ role: "tool", content: "a" });
  });
});

describe("追踪", () => {
  test("span 的结构：agent.run → step → model / tool", async () => {
    const tracer = createRecordingTracer({ now: () => 0 });
    const { agent } = agentWith(
      [{ toolCalls: [echo("a")], usage: { inputTokens: 1, outputTokens: 1 } }, { text: "ok" }],
      {
        tracer,
      },
    );
    await agent.run("go").result;
    expect(tracer.tree()).toBe(
      [
        "agent.run 0ms",
        "  step 0ms",
        "    model 0ms",
        "    tool echo 0ms",
        "  step 0ms",
        "    model 0ms",
      ].join("\n"),
    );
    const run = tracer.spans[0];
    expect(run?.attributes).toMatchObject({ stopReason: "completed" });
    expect(tracer.spans.find((s) => s.name === "model")?.attributes).toMatchObject({
      finishReason: "tool_calls",
      usage: { inputTokens: 1, outputTokens: 1 },
    });
  });

  test("失败的模型调用记录为错误", async () => {
    const tracer = createRecordingTracer({ now: () => 0 });
    const { agent } = agentWith([{ fail: new Error("坏了") }], { tracer, modelRetries: 0 });
    await agent.run("go").result;
    expect(tracer.tree()).toBe(
      ["agent.run 0ms ✗ 坏了", "  step 0ms", "    model 0ms ✗ 坏了"].join("\n"),
    );
  });
});
