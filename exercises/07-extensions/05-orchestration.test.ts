import { describe, expect, test } from "vitest";
import { orchestrate, shareContext, type Specialist } from "./05-orchestration.ts";

describe("shareContext", () => {
  test("只留允许的字符串，丢掉密钥、拒绝名单和非字符串", () => {
    const facts = {
      note: "买牛奶",
      apiKey: "sk-secret",
      access_token: "t",
      inputTokens: "12",
      userId: "u1",
      count: 3,
      extra: "不要",
    };
    const shared = shareContext(facts, {
      allow: [
        "note",
        "note",
        "apiKey",
        "access_token",
        "inputTokens",
        "userId",
        "count",
        "missing",
      ],
      deny: ["UserId"],
    });
    expect(shared).toEqual({ note: "买牛奶", inputTokens: "12" });
    expect(Object.keys(shared)).toEqual(["note", "inputTokens"]);
    facts.note = "改了";
    expect(shared["note"]).toBe("买牛奶");
    shared["note"] = "也改了";
    expect(shareContext(facts, { allow: ["note"] })["note"]).toBe("改了");
  });
});

describe("orchestrate", () => {
  test("委托把结果记在笔记里，交接立刻结束", async () => {
    const seen: Record<string, unknown>[] = [];
    const specialists: Specialist[] = [
      {
        name: "搜索",
        run: (task, context) => {
          seen.push({ task, context });
          return Promise.resolve(`找到 ${task}`);
        },
      },
      {
        name: "写作",
        run: (task) => Promise.resolve(`写完 ${task}`),
      },
    ];
    let calls = 0;
    const delegated = await orchestrate({
      specialists,
      context: { topic: "牛奶" },
      route: ({ step, notes }) => {
        calls += 1;
        if (step === 1) return { type: "delegate", specialist: "搜索", task: "牛奶" };
        expect(notes).toEqual(["搜索：找到 牛奶"]);
        return { type: "final", text: "好了" };
      },
    });
    expect(delegated).toEqual({ text: "好了", notes: ["搜索：找到 牛奶"], steps: 2 });
    expect(delegated.handoff).toBeUndefined();
    expect(seen[0]).toEqual({ task: "牛奶", context: { topic: "牛奶" } });
    expect(Object.isFrozen((seen[0] as { context: object }).context)).toBe(true);

    const handed = await orchestrate({
      specialists,
      context: {},
      route: ({ step }) => {
        if (step === 1) return { type: "delegate", specialist: "搜索", task: "a" };
        return { type: "handoff", specialist: "写作", task: "b" };
      },
    });
    expect(handed.handoff).toBe("写作");
    expect(handed.text).toBe("写完 b");
    expect(handed.notes).toEqual(["搜索：找到 a"]);
    expect(handed.steps).toBe(2);
    expect(calls).toBe(2);
  });

  test("步数用尽、未知专家、已经取消、maxSteps 不合法", async () => {
    const specialists: Specialist[] = [{ name: "搜索", run: () => Promise.resolve("x") }];
    const stopped = await orchestrate({
      specialists,
      context: {},
      maxSteps: 1,
      route: () => ({ type: "delegate", specialist: "搜索", task: "a" }),
    });
    expect(stopped).toEqual({
      text: "编排在 1 步后停止，还没有最终回答",
      notes: ["搜索：x"],
      steps: 1,
    });
    await expect(
      orchestrate({
        specialists,
        context: {},
        route: () => ({ type: "delegate", specialist: "没有", task: "a" }),
      }),
    ).rejects.toThrow(/没有/);
    await expect(
      orchestrate({
        specialists,
        context: {},
        signal: AbortSignal.abort(),
        route: () => {
          throw new Error("不应该问到");
        },
      }),
    ).rejects.toThrow(/aborted|Abort/i);
    await expect(
      orchestrate({
        specialists,
        context: {},
        maxSteps: 0,
        route: () => ({ type: "final", text: "" }),
      }),
    ).rejects.toThrow(RangeError);
  });
});
