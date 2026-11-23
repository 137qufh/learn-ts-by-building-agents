/**
 * 练习 5-2：聊天记录的 schema
 *
 * 课程：chapters/05-validation/02-zod-basics.md
 * 运行：pnpm ex 02-transcript-schema
 *
 * 第 1 章的项目为聊天记录建了类型模型（exercises/01-basics/project/transcript.ts）。
 * 把聊天记录存到文件里、下次启动再读回来时，读到的是 unknown：文件可能被手改过，可能是旧版本写的。
 * 用 Zod 为每种消息写一个 schema，让 z.infer 推导出的类型和第 1 章的类型 **完全相同**。
 *
 * 类型测试（02-transcript-schema.test-d.ts）会逐个比较 z.infer<typeof XxxSchema> 和第 1 章的类型。
 * 运行时测试检查校验的行为。
 *
 * 题目里每个 schema 先用 z.never() 占位（它拒绝一切输入），把它们换成你的实现。
 */
import { z } from "zod";
import { todo } from "../todo.ts";

/** { role: "system"; content: string } */
export const SystemMessageSchema = z.never();

/** { role: "user"; content: string } */
export const UserMessageSchema = z.never();

/**
 * { id: string; name: string; arguments: Record<string, unknown> }
 * id 和 name 不能是空字符串。
 */
export const ToolCallSchema = z.never();

/**
 * { role: "assistant"; content: string; toolCalls?: readonly ToolCall[] }
 * 注意第 1 章的 toolCalls 是 `readonly ToolCall[]`，而且可选属性 **不带** `| undefined`。
 */
export const AssistantMessageSchema = z.never();

/**
 * { role: "tool"; toolCallId: string; content: string; isError?: boolean }
 * toolCallId 不能是空字符串。
 */
export const ToolMessageSchema = z.never();

/** 四种消息的可辨识联合，按 role 区分。 */
export const MessageSchema = z.never();

/** readonly Message[] */
export const TranscriptSchema = z.never();

export type LoadResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * 从 JSON 文本读取一份聊天记录。
 * - 不是合法的 JSON：error 是 `不是合法的 JSON：${JSON.parse 抛出的错误的 message}`
 * - 结构不对：error 是 z.prettifyError 的结果
 * 永远不抛出异常。
 */
export function loadTranscript(text: string): LoadResult<z.infer<typeof TranscriptSchema>> {
  return todo("实现 loadTranscript");
}
