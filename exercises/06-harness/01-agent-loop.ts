/**
 * 练习 6-1：agent 主循环
 *
 * 课程：chapters/06-harness/01-agent-loop.md
 * 运行：pnpm ex 01-agent-loop
 *
 * agent 的核心只有几行：把聊天记录发给模型 → 模型要调用工具就执行，把结果追加进记录 → 再发给模型……
 * 直到模型不再调用工具。这道题写出这个循环最朴素的版本，后面几节给它加上并行、预算、恢复、事件……
 *
 * 第一部分：collectTurn(events)
 *   把一次 stream 的事件收集成一个 Turn：
 *   - text 事件的文本按顺序拼起来
 *   - tool_call 事件的 call 按顺序放进 toolCalls
 *   - finish 事件给出 finishReason 和 usage；没有 finish 事件时 finishReason 是 "unknown"
 *   - 没有用量时，结果里不出现 usage 属性（exactOptionalPropertyTypes，1.8 节）
 *
 * 第二部分：assistantMessage(turn)
 *   把回合变成要追加进聊天记录的 assistant 消息（接口的格式，第 3 章）：
 *   - 文本为空时 content 是 null，否则是文本
 *   - 没有工具调用时不写 tool_calls 属性；有的话每个调用变成 { id, type: "function", function: { name, arguments } }
 *
 * 第三部分：runAgentLoop({ model, tools, messages, maxSteps = 10 })
 *   - 不修改传入的 messages，在一份副本上追加
 *   - 每一步：请求是 { messages: 这一刻聊天记录的副本, tools: tools.schemas() }；schemas 为空时不写 tools
 *     （副本很重要：模型可能把请求保存下来，后面追加的消息不应该悄悄出现在它保存的请求里）
 *   - 用 collectTurn 收集回复，把 assistantMessage 追加进记录
 *   - 没有工具调用：停止，stopReason 是 "completed"，text 是这一回合的文本，steps 是这是第几步
 *   - 有工具调用：按顺序一个一个执行（tools.dispatch），每个结果追加一条
 *     { role: "tool", tool_call_id: 调用的 id, content: 结果的 content }
 *   - 执行完 maxSteps 步还没结束：stopReason 是 "max_steps"，text 是 ""，steps 是 maxSteps
 */
import type {
  CallOptions,
  ChatRequest,
  FunctionDefinition,
  Message,
  RawToolCall,
  StreamEvent,
  Usage,
} from "@learn-ts/agent-kit";
import { todo } from "../todo.ts";

/** harness 眼里的模型：只要能 stream 就行。第 3 章的 LlmClient 天然符合这个接口。 */
export interface Model {
  stream(request: ChatRequest, options?: CallOptions): AsyncIterable<StreamEvent>;
}

/** 执行工具的一方。第 5 章的 Toolbox 天然符合这个接口。 */
export interface ToolExecutor {
  schemas(): readonly FunctionDefinition[];
  dispatch(
    call: RawToolCall,
    options?: { signal?: AbortSignal },
  ): Promise<{ id: string; ok: boolean; content: string }>;
}

/** 模型的一次回复（一个"回合"）。 */
export interface Turn {
  text: string;
  toolCalls: RawToolCall[];
  finishReason: string;
  usage?: Usage;
}

export async function collectTurn(events: AsyncIterable<StreamEvent>): Promise<Turn> {
  return todo("实现 collectTurn");
}

export function assistantMessage(turn: Pick<Turn, "text" | "toolCalls">): Message {
  return todo("实现 assistantMessage");
}

export interface LoopOptions {
  model: Model;
  tools: ToolExecutor;
  messages: readonly Message[];
  /** 最多调用模型几次，默认 10 */
  maxSteps?: number;
}

export interface LoopResult {
  /** 完整的聊天记录：传入的消息 + 这次运行追加的 */
  messages: Message[];
  /** 最后一回合的文本（达到 maxSteps 时是 ""） */
  text: string;
  /** 调用了模型几次 */
  steps: number;
  stopReason: "completed" | "max_steps";
}

export async function runAgentLoop(options: LoopOptions): Promise<LoopResult> {
  return todo("实现 runAgentLoop");
}
