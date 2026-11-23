/**
 * harness 和模型、工具之间的接口，以及把一次流式回复收集成一个回合（来自练习 6-1）
 */
import type {
  CallOptions,
  ChatRequest,
  FunctionDefinition,
  Message,
  StreamEvent,
} from "../client.ts";
import type { RawToolCall } from "../registry.ts";
import type { Usage } from "../usage.ts";

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
