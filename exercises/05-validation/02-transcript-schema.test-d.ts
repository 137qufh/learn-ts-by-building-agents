import { describe, expectTypeOf, test } from "vitest";
import type { z } from "zod";
import type {
  AssistantMessage,
  Message,
  SystemMessage,
  ToolCall,
  ToolMessage,
  Transcript,
  UserMessage,
} from "../01-basics/project/transcript.ts";
import type {
  AssistantMessageSchema,
  MessageSchema,
  SystemMessageSchema,
  ToolCallSchema,
  ToolMessageSchema,
  TranscriptSchema,
  UserMessageSchema,
} from "./02-transcript-schema.ts";

describe("z.infer 和第 1 章的类型完全相同", () => {
  test("SystemMessage", () => {
    expectTypeOf<z.infer<typeof SystemMessageSchema>>().toEqualTypeOf<SystemMessage>();
  });

  test("UserMessage", () => {
    expectTypeOf<z.infer<typeof UserMessageSchema>>().toEqualTypeOf<UserMessage>();
  });

  test("ToolCall", () => {
    expectTypeOf<z.infer<typeof ToolCallSchema>>().toEqualTypeOf<ToolCall>();
  });

  test("AssistantMessage：toolCalls 是只读数组，可选属性不带 undefined", () => {
    expectTypeOf<z.infer<typeof AssistantMessageSchema>>().toEqualTypeOf<AssistantMessage>();
  });

  test("ToolMessage", () => {
    expectTypeOf<z.infer<typeof ToolMessageSchema>>().toEqualTypeOf<ToolMessage>();
  });

  test("Message 是四种消息的联合", () => {
    expectTypeOf<z.infer<typeof MessageSchema>>().toEqualTypeOf<Message>();
  });

  test("Transcript", () => {
    expectTypeOf<z.infer<typeof TranscriptSchema>>().toEqualTypeOf<Transcript>();
  });
});
