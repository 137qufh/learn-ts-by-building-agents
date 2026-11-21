/**
 * 第 1 章项目：聊天记录（transcript）的类型模型
 *
 * 课程：chapters/01-basics/09-project-chat-transcript.md
 * 测试：pnpm ex transcript
 * 试玩：pnpm tsx chapters/01-basics/project/demo.ts
 *
 * agent 的全部"记忆"就是一份聊天记录：系统提示、用户的话、模型的回答、模型发起的
 * 工具调用、工具返回的结果……每一轮循环都是"把整份记录发给模型，再把模型的回应追加进去"。
 * 这个项目为它建立类型模型，并实现几个第 6 章写 harness 时会直接用到的函数。
 *
 * 类型已经定义好了，请实现下面的函数。规则以注释和测试为准。
 */
import { todo } from "../../todo.ts";

// ─────────────────────────────── 类型 ───────────────────────────────

export type Role = "system" | "user" | "assistant" | "tool";

export interface SystemMessage {
  role: "system";
  content: string;
}

export interface UserMessage {
  role: "user";
  content: string;
}

/** 模型请求调用的一个工具。 */
export interface ToolCall {
  /** 由模型生成的唯一 ID，工具结果通过它和这次调用对应起来 */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AssistantMessage {
  role: "assistant";
  /** 模型说的话；只调用工具、什么都不说时为空字符串 */
  content: string;
  /** 模型请求的工具调用；没有时不存在这个属性（而不是空数组） */
  toolCalls?: readonly ToolCall[];
}

export interface ToolMessage {
  role: "tool";
  /** 对应的 ToolCall.id */
  toolCallId: string;
  content: string;
  /** 工具执行失败时为 true；成功时不存在这个属性 */
  isError?: boolean;
}

export type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

export type Transcript = readonly Message[];

// ───────────────────────────── 构造函数 ─────────────────────────────

export function systemMessage(content: string): SystemMessage {
  return todo("实现 systemMessage");
}

export function userMessage(content: string): UserMessage {
  return todo("实现 userMessage");
}

/**
 * toolCalls 为 undefined 或空数组时，结果里不能出现 toolCalls 属性。
 */
export function assistantMessage(
  content: string,
  toolCalls?: readonly ToolCall[],
): AssistantMessage {
  return todo("实现 assistantMessage");
}

/**
 * 只有 options.isError 为 true 时，结果里才有 isError 属性（值为 true）。
 */
export function toolMessage(
  toolCallId: string,
  content: string,
  options: { isError?: boolean } = {},
): ToolMessage {
  return todo("实现 toolMessage");
}

// ─────────────────────────────── 渲染 ───────────────────────────────

/**
 * 把一条消息渲染成便于阅读的文本：
 *
 *   system    → "[system] <content>"
 *   user      → "[user] <content>"
 *   assistant → "[assistant] <content>"，每个工具调用再追加一行：
 *               "  → <name>(<JSON.stringify(arguments)>) #<id>"
 *   tool      → "[tool #<toolCallId>] <content>"；失败时为 "[tool #<toolCallId>] ERROR: <content>"
 *
 * content 为空字符串时，第一行只保留方括号部分，末尾不要多余的空格，例如 "[assistant]"。
 * 失败的 tool 消息即使 content 为空，也保留 "ERROR:"，即 "[tool #id] ERROR:"。
 *
 * 要求：对 role 做 switch，并加上穷尽性检查。
 */
export function renderMessage(message: Message): string {
  return todo("实现 renderMessage");
}

/** 渲染整份记录：每条消息用 renderMessage 渲染，之间用换行符连接。 */
export function renderTranscript(transcript: Transcript): string {
  return todo("实现 renderTranscript");
}

// ─────────────────────────────── 分析 ───────────────────────────────

/** 统计每种角色的消息数。结果包含全部四种角色，没有出现的为 0。 */
export function countByRole(transcript: Transcript): Record<Role, number> {
  return todo("实现 countByRole");
}

/**
 * 返回所有"还没有得到结果"的工具调用，按发起的先后顺序排列。
 *
 * 一个工具调用得到结果，是指记录中 **在它之后** 出现了 toolCallId 与它的 id 相同的 tool 消息。
 *
 * 这是 agent 循环的核心判断：模型说完话后，如果还有待处理的工具调用，就去执行它们；
 * 如果没有了，这一轮就结束了。
 */
export function pendingToolCalls(transcript: Transcript): ToolCall[] {
  return todo("实现 pendingToolCalls");
}

/**
 * 检查记录是否符合模型 API 的要求，返回发现的所有问题（没有问题时返回空数组）。
 * 消息从 1 开始编号，问题按发现的顺序排列。规则：
 *
 * 1. system 消息只能是第 1 条：
 *      "第 N 条：system 消息只能出现在开头"
 * 2. 工具调用的 id 在整份记录中不能重复（第二次出现时报告）：
 *      "第 N 条：工具调用 ID <id> 重复"
 * 3. tool 消息必须回应一个之前发起过、且还没有得到结果的工具调用：
 *      从未发起过：   "第 N 条：tool 消息引用了未知的工具调用 <id>"
 *      已经回应过了： "第 N 条：工具调用 <id> 被重复回应"
 * 4. 有工具调用还在等待结果时，不能出现 user 或 assistant 消息（模型 API 要求工具结果紧跟在调用之后）：
 *      "第 N 条：工具调用 <id1>, <id2> 还没有结果，不能出现 <role> 消息"
 *    （等待中的 id 按发起顺序列出，用 ", " 分隔。报告之后，这些工具调用依然算作等待中。）
 *
 * 记录以"还在等待结果的工具调用"结尾是允许的：那正是 harness 要去执行工具的时刻。
 */
export function validateTranscript(transcript: Transcript): string[] {
  return todo("实现 validateTranscript");
}
