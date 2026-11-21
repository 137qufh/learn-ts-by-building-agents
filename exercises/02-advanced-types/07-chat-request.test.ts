import { describe, expect, test } from "vitest";
import {
  DEFAULT_TUNABLES,
  applyUpdate,
  fakeModel,
  redact,
  resolveRequest,
  summarize,
  type ChatRequest,
} from "./07-chat-request.ts";

const request: ChatRequest = {
  model: "gpt-5",
  messages: [{ role: "user", content: "你好" }],
  temperature: 0.2,
  user: "user_42",
};

describe("resolveRequest", () => {
  test("补齐缺少的字段，保留已有的字段", () => {
    expect(resolveRequest(request)).toStrictEqual({
      ...request,
      temperature: 0.2,
      maxTokens: 1024,
      stream: false,
    });
  });

  test("可以传入自己的默认值", () => {
    const resolved = resolveRequest(
      { model: "gpt-5", messages: [] },
      { temperature: 0, maxTokens: 10, stream: true },
    );
    expect(resolved).toStrictEqual({
      model: "gpt-5",
      messages: [],
      temperature: 0,
      maxTokens: 10,
      stream: true,
    });
  });

  test("不修改 request 和默认值", () => {
    const copy = { ...request };
    resolveRequest(request);
    expect(request).toStrictEqual(copy);
    expect(DEFAULT_TUNABLES).toStrictEqual({ temperature: 1, maxTokens: 1024, stream: false });
  });
});

describe("applyUpdate", () => {
  test("应用更新", () => {
    const resolved = resolveRequest(request);
    expect(applyUpdate(resolved, { stream: true, maxTokens: 64 })).toStrictEqual({
      ...resolved,
      stream: true,
      maxTokens: 64,
    });
  });

  test("空的更新得到相同内容的新对象", () => {
    const resolved = resolveRequest(request);
    const updated = applyUpdate(resolved, {});
    expect(updated).toStrictEqual(resolved);
    expect(updated).not.toBe(resolved);
  });
});

describe("redact", () => {
  test("去掉 user", () => {
    expect(redact(request)).toStrictEqual({
      model: "gpt-5",
      messages: [{ role: "user", content: "你好" }],
      temperature: 0.2,
    });
    expect(Object.hasOwn(redact(request), "user")).toBe(false);
  });

  test("没有 user 时也能用", () => {
    expect(redact({ model: "gpt-5", messages: [] })).toStrictEqual({
      model: "gpt-5",
      messages: [],
    });
  });

  test("不修改原对象", () => {
    redact(request);
    expect(request.user).toBe("user_42");
  });
});

describe("summarize", () => {
  test("生成摘要", () => {
    const resolved = resolveRequest({
      ...request,
      tools: [
        { name: "search", description: "搜索" },
        { name: "read_file", description: "读文件" },
      ],
    });
    expect(summarize(resolved)).toStrictEqual({
      model: "gpt-5",
      temperature: 0.2,
      maxTokens: 1024,
      messageCount: 1,
      toolNames: ["search", "read_file"],
    });
  });

  test("没有 tools 时 toolNames 是空数组", () => {
    expect(summarize(resolveRequest(request)).toolNames).toStrictEqual([]);
  });
});

describe("fakeModel", () => {
  test("返回模拟的回答", async () => {
    await expect(fakeModel({ model: "gpt-5" })).resolves.toStrictEqual({
      model: "gpt-5",
      content: "你好！",
      finishReason: "stop",
    });
  });
});
