/**
 * 练习 5-6：给流式响应写 schema
 *
 * 课程：chapters/05-validation/06-api-responses.md
 * 运行：pnpm ex 06-chunk-schema
 *
 * 第 3 章的 parseChunk 用 `value as ChatChunk` 把服务器发来的数据"断言"成了 ChatChunk。
 * 现在用 Zod 真正检查它。原则是：用到的字段严格检查，没用到的、新增的字段宽容对待。
 *
 * 规则：
 * - 所有 token 数和 index 都是非负整数
 * - 可以缺少的字段，也可以是 null（不同的服务商写法不同：有的省略，有的写 null）
 *     ToolCallDeltaSchema：index 必须有；id、function 可以缺少；function 里的 name、arguments 可以缺少
 *     DeltaSchema：content、tool_calls 可以缺少
 *     ChoiceSchema：delta、finish_reason 可以缺少
 *     UsageSchema：prompt_tokens、completion_tokens 必须有；prompt_tokens_details 和其中的 cached_tokens 可以缺少
 *     ChatChunkSchema：choices 缺少时是 []；usage、error 可以缺少；error 里的 message 可以缺少
 *   null 原样保留，不用转换成 undefined
 * - 不认识的字段直接忽略（不报错，也不出现在结果里）
 * - finish_reason：认识的值（KnownFinishReason）原样保留，其他字符串都变成 "other"
 *   （服务商会增加新的值，比如 DeepSeek 的 "insufficient_system_resource"，不能因此让整个流失败）
 *
 * parseChunk(data)：
 * - 不是合法的 JSON：抛出 Error(`无法解析的数据：${data 的前 100 个字符}`)，cause 是 JSON.parse 的错误
 * - 不符合 schema：抛出 Error(`数据格式不对：\n${z.prettifyError(...)}`)，cause 是 ZodError
 *
 * 提示：先把所有 schema 写成 z.never() 的地方换掉；ChatChunk 的类型由 schema 推导，不用手写。
 */
import { z } from "zod";
import { todo } from "../todo.ts";

/** 已给出 */
export const KnownFinishReason = z.enum(["stop", "length", "tool_calls", "content_filter"]);

// 把下面的 z.never() 换成你的 schema
export const FinishReasonSchema = z.never();
export type FinishReason = z.output<typeof FinishReasonSchema>;

export const ToolCallDeltaSchema = z.never();
export const DeltaSchema = z.never();
export const ChoiceSchema = z.never();
export const UsageSchema = z.never();
export const ChatChunkSchema = z.never();

export type ChatChunk = z.output<typeof ChatChunkSchema>;

export function parseChunk(data: string): ChatChunk {
  return todo("实现 parseChunk");
}
