import { createAgent } from "@learn-ts/agent-kit";
import { createScriptedModel } from "@learn-ts/agent-kit/testing";
import { describe, expect, test } from "vitest";
import { delegate, parentSummary } from "./04-delegate.ts";

describe("delegate", () => {
  test("子 agent 只有自己的 system 和这一次任务，看不到别的内容", async () => {
    const model = createScriptedModel([{ text: "两瓶低脂" }]);
    const agent = createAgent({ model, system: "用一句话总结" });
    const result = await delegate(agent, "总结购物", { context: "买牛奶" });
    expect(result.text).toBe("两瓶低脂");
    expect(result.stopReason).toEqual({ type: "completed" });
    expect(result.steps).toBe(1);
    expect(parentSummary(result)).toBe("两瓶低脂");
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0]?.messages).toEqual([
      { role: "system", content: "用一句话总结" },
      { role: "user", content: "背景：\n买牛奶\n\n任务：\n总结购物" },
    ]);
  });

  test("没有背景时用户消息就是任务本身", async () => {
    const model = createScriptedModel([{ text: "好" }]);
    const agent = createAgent({ model });
    const result = await delegate(agent, "只要这句话");
    expect(model.requests[0]?.messages).toEqual([{ role: "user", content: "只要这句话" }]);
    expect(result.messages.at(-1)).toMatchObject({ role: "assistant", content: "好" });
  });

  test("没有完成时，交还给父模型的文字带上停止原因", async () => {
    const model = createScriptedModel([
      { toolCalls: [{ name: "missing", arguments: {} }] },
      { text: "还想继续" },
    ]);
    const agent = createAgent({
      model,
      maxSteps: 1,
      tools: {
        schemas: () => [
          { name: "missing", description: "没有实现", parameters: { type: "object" } },
        ],
        dispatch: (call) => Promise.resolve({ id: call.id, ok: true, content: "x" }),
      },
    });
    const result = await delegate(agent, "做点事");
    expect(result.stopReason).toEqual({ type: "max_steps", maxSteps: 1 });
    expect(parentSummary(result)).toBe("子 agent 没有完成（max_steps）：（没有回答）");
  });

  test("取消变成 cancelled，而不是拒绝", async () => {
    const model = createScriptedModel([{ text: "来不及" }]);
    const agent = createAgent({ model });
    const result = await delegate(agent, "任务", { signal: AbortSignal.abort() });
    expect(result.stopReason).toEqual({ type: "cancelled" });
    expect(parentSummary(result)).toContain("cancelled");
  });
});
