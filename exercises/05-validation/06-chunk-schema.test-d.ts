import { expectTypeOf, test } from "vitest";
import type { ChatChunk, FinishReason } from "./06-chunk-schema.ts";

test("FinishReason：认识的值加上 other", () => {
  expectTypeOf<FinishReason>().toEqualTypeOf<
    "stop" | "length" | "tool_calls" | "content_filter" | "other"
  >();
});

test("ChatChunk 由 schema 推导", () => {
  type Choice = ChatChunk["choices"][number];
  type ToolCallDelta = NonNullable<NonNullable<Choice["delta"]>["tool_calls"]>[number];

  expectTypeOf<ChatChunk["choices"]>().toEqualTypeOf<Choice[]>();
  expectTypeOf<Choice["finish_reason"]>().toEqualTypeOf<FinishReason | null | undefined>();
  expectTypeOf<NonNullable<Choice["delta"]>["content"]>().toEqualTypeOf<
    string | null | undefined
  >();
  expectTypeOf<ToolCallDelta["index"]>().toEqualTypeOf<number>();
  expectTypeOf<ToolCallDelta["id"]>().toEqualTypeOf<string | null | undefined>();
  expectTypeOf<NonNullable<ChatChunk["usage"]>["prompt_tokens"]>().toEqualTypeOf<number>();
});
