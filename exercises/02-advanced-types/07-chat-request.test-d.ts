import { describe, expectTypeOf, test } from "vitest";
import {
  applyUpdate,
  redact,
  resolveRequest,
  summarize,
  type ChatMessage,
  type ChatRequest,
  type ModelReply,
  type RequestSummary,
  type RequestUpdate,
  type ResolvedRequest,
  type StrictOmit,
  type ToolSpec,
  type Tunables,
} from "./07-chat-request.ts";

// 把交叉类型"展开"成一个对象类型再比较，这样 { a } & { b } 和 { a; b } 被视为相等（见 2.8 节）
type Expand<T> = { [K in keyof T]: T[K] };

describe("Tunables", () => {
  test("三个必需的字段", () => {
    expectTypeOf<Tunables>().toEqualTypeOf<{
      temperature: number;
      maxTokens: number;
      stream: boolean;
    }>();
  });
});

describe("ResolvedRequest", () => {
  test("Tunables 的字段变成必需，其他不变", () => {
    expectTypeOf<Expand<ResolvedRequest>>().toEqualTypeOf<{
      model: string;
      messages: readonly ChatMessage[];
      temperature: number;
      maxTokens: number;
      stream: boolean;
      tools?: readonly ToolSpec[];
      user?: string;
    }>();
  });
});

describe("RequestUpdate", () => {
  test("除了 model 和 messages 都可选", () => {
    expectTypeOf<RequestUpdate>().toEqualTypeOf<{
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
      tools?: readonly ToolSpec[];
      user?: string;
    }>();
  });
});

describe("StrictOmit", () => {
  test("和 Omit 结果相同", () => {
    expectTypeOf<StrictOmit<ChatRequest, "user" | "tools">>().toEqualTypeOf<
      Omit<ChatRequest, "user" | "tools">
    >();
  });

  test("拼错的键报错", () => {
    // @ts-expect-error -- "usr" 不是 ChatRequest 的键
    expectTypeOf<StrictOmit<ChatRequest, "usr">>();
  });
});

describe("RequestSummary", () => {
  test("三个字段加两个新字段", () => {
    expectTypeOf<Expand<RequestSummary>>().toEqualTypeOf<{
      model: string;
      temperature: number;
      maxTokens: number;
      messageCount: number;
      toolNames: string[];
    }>();
  });
});

describe("ModelReply", () => {
  test("从 fakeModel 推导", () => {
    expectTypeOf<ModelReply>().toEqualTypeOf<{
      model: string;
      content: string;
      finishReason: "stop";
    }>();
  });
});

const request: ChatRequest = { model: "gpt-5", messages: [] };

describe("函数签名", () => {
  test("resolveRequest 返回 ResolvedRequest", () => {
    expectTypeOf(resolveRequest(request)).toEqualTypeOf<ResolvedRequest>();
  });

  test("resolveRequest 的 defaults 必须完整", () => {
    // @ts-expect-error -- 缺少 stream
    resolveRequest(request, { temperature: 0, maxTokens: 10 });
  });

  test("applyUpdate 不允许修改 model", () => {
    const resolved = resolveRequest(request);
    expectTypeOf(applyUpdate(resolved, { stream: true })).toEqualTypeOf<ResolvedRequest>();
    // @ts-expect-error -- model 不在 RequestUpdate 里
    applyUpdate(resolved, { model: "gpt-4" });
  });

  test("applyUpdate 只接受补齐过的请求", () => {
    // @ts-expect-error -- request 还没有补齐默认值
    applyUpdate(request, {});
  });

  test("redact 的结果没有 user", () => {
    const redacted = redact(resolveRequest(request));
    expectTypeOf(redacted).toEqualTypeOf<StrictOmit<ResolvedRequest, "user">>();
    expectTypeOf(redacted).not.toHaveProperty("user");
  });

  test("summarize 返回 RequestSummary", () => {
    expectTypeOf(summarize(resolveRequest(request))).toEqualTypeOf<RequestSummary>();
  });
});
