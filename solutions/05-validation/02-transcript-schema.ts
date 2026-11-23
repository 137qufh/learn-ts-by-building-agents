/**
 * 练习 5-2 参考答案：聊天记录的 schema
 */
import { z } from "zod";

export const SystemMessageSchema = z.object({
  role: z.literal("system"),
  content: z.string(),
});

export const UserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.string(),
});

export const ToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
});

export const AssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.string(),
  // exactOptional：类型是 toolCalls?: readonly ToolCall[]，和第 1 章一致（不带 | undefined）
  toolCalls: z.array(ToolCallSchema).readonly().exactOptional(),
});

export const ToolMessageSchema = z.object({
  role: z.literal("tool"),
  toolCallId: z.string().min(1),
  content: z.string(),
  isError: z.boolean().exactOptional(),
});

export const MessageSchema = z.discriminatedUnion("role", [
  SystemMessageSchema,
  UserMessageSchema,
  AssistantMessageSchema,
  ToolMessageSchema,
]);

export const TranscriptSchema = z.array(MessageSchema).readonly();

export type LoadResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function loadTranscript(text: string): LoadResult<z.infer<typeof TranscriptSchema>> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `不是合法的 JSON：${(error as Error).message}` };
  }
  const result = TranscriptSchema.safeParse(json);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: z.prettifyError(result.error) };
}
