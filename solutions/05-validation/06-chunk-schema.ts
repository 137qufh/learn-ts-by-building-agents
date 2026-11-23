/**
 * 练习 5-6 参考答案：给流式响应写 schema
 */
import { z } from "zod";

const count = z.number().int().min(0);

export const KnownFinishReason = z.enum(["stop", "length", "tool_calls", "content_filter"]);

export const FinishReasonSchema = KnownFinishReason.or(
  z.string().transform(() => "other" as const),
);
export type FinishReason = z.output<typeof FinishReasonSchema>;

export const ToolCallDeltaSchema = z.object({
  index: count,
  id: z.string().nullish(),
  function: z.object({ name: z.string().nullish(), arguments: z.string().nullish() }).nullish(),
});

export const DeltaSchema = z.object({
  content: z.string().nullish(),
  tool_calls: z.array(ToolCallDeltaSchema).nullish(),
});

export const ChoiceSchema = z.object({
  delta: DeltaSchema.nullish(),
  finish_reason: FinishReasonSchema.nullish(),
});

export const UsageSchema = z.object({
  prompt_tokens: count,
  completion_tokens: count,
  prompt_tokens_details: z.object({ cached_tokens: count.nullish() }).nullish(),
});

export const ChatChunkSchema = z.object({
  choices: z.array(ChoiceSchema).default([]),
  usage: UsageSchema.nullish(),
  error: z.object({ message: z.string().nullish() }).nullish(),
});

export type ChatChunk = z.output<typeof ChatChunkSchema>;

export function parseChunk(data: string): ChatChunk {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch (error) {
    throw new Error(`无法解析的数据：${data.slice(0, 100)}`, { cause: error });
  }
  const result = ChatChunkSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`数据格式不对：\n${z.prettifyError(result.error)}`, { cause: result.error });
  }
  return result.data;
}
