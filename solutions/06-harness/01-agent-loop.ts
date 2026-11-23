/**
 * 练习 6-1 参考答案：agent 主循环
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
  let text = "";
  const toolCalls: RawToolCall[] = [];
  let finishReason = "unknown";
  let usage: Usage | undefined;
  for await (const event of events) {
    switch (event.type) {
      case "text":
        text += event.text;
        break;
      case "tool_call":
        toolCalls.push(event.call);
        break;
      case "finish":
        finishReason = event.reason;
        usage = event.usage;
        break;
    }
  }
  return usage === undefined
    ? { text, toolCalls, finishReason }
    : { text, toolCalls, finishReason, usage };
}

export function assistantMessage(turn: Pick<Turn, "text" | "toolCalls">): Message {
  const content = turn.text === "" ? null : turn.text;
  if (turn.toolCalls.length === 0) {
    return { role: "assistant", content };
  }
  return {
    role: "assistant",
    content,
    tool_calls: turn.toolCalls.map((call) => ({
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: call.arguments },
    })),
  };
}

export interface LoopOptions {
  model: Model;
  tools: ToolExecutor;
  messages: readonly Message[];
  maxSteps?: number;
}

export interface LoopResult {
  messages: Message[];
  text: string;
  steps: number;
  stopReason: "completed" | "max_steps";
}

export async function runAgentLoop(options: LoopOptions): Promise<LoopResult> {
  const { model, tools, maxSteps = 10 } = options;
  const messages = [...options.messages];
  const schemas = tools.schemas();

  for (let step = 1; step <= maxSteps; step++) {
    // 每次请求都发一份副本：模型（尤其是测试里的假模型）拿到的是"这一刻"的聊天记录，
    // 后面 push 进来的消息不会悄悄出现在它保存的请求里
    const request: ChatRequest =
      schemas.length === 0
        ? { messages: [...messages] }
        : { messages: [...messages], tools: schemas };
    const turn = await collectTurn(model.stream(request));
    messages.push(assistantMessage(turn));

    if (turn.toolCalls.length === 0) {
      return { messages, text: turn.text, steps: step, stopReason: "completed" };
    }
    for (const call of turn.toolCalls) {
      const result = await tools.dispatch(call);
      messages.push({ role: "tool", tool_call_id: call.id, content: result.content });
    }
  }
  return { messages, text: "", steps: maxSteps, stopReason: "max_steps" };
}
