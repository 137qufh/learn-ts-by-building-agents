/**
 * 练习 6-2 参考答案：按脚本回复的假模型
 */
import {
  abortableSleep,
  type ChatRequest,
  type StreamEvent,
  type Usage,
} from "@learn-ts/agent-kit";
import type { Model } from "./01-agent-loop.ts";

export interface ScriptedToolCall {
  id?: string;
  name: string;
  arguments?: string | Record<string, unknown>;
}

export interface ScriptedReply {
  text?: string;
  toolCalls?: readonly ScriptedToolCall[];
  finishReason?: string;
  usage?: Usage;
}

export interface ScriptedFailure {
  fail: Error;
  afterText?: string;
}

export type ScriptStep =
  ScriptedReply | ScriptedFailure | ((request: ChatRequest) => ScriptedReply);

export interface ScriptedModelOptions {
  chunkSize?: number;
  delayMs?: number;
}

export interface ScriptedModel extends Model {
  readonly requests: readonly ChatRequest[];
  readonly remaining: number;
}

export function createScriptedModel(
  steps: readonly ScriptStep[],
  options: ScriptedModelOptions = {},
): ScriptedModel {
  const { chunkSize = 4, delayMs = 0 } = options;
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new RangeError(`chunkSize 必须是正整数，收到的是 ${chunkSize}`);
  }
  const requests: ChatRequest[] = [];
  let next = 0;
  let callCount = 0;

  async function* stream(
    request: ChatRequest,
    callOptions: { signal?: AbortSignal } = {},
  ): AsyncGenerator<StreamEvent> {
    const { signal } = callOptions;
    signal?.throwIfAborted();
    const index = next++;
    const step = steps[index];
    if (step === undefined) {
      throw new Error(`脚本已经用完：模型被调用了第 ${index + 1} 次，脚本只有 ${steps.length} 步`);
    }
    // 保存的是副本：调用方之后修改 messages 数组，不会改写这里的记录
    const recorded = structuredClone(request);
    requests.push(recorded);

    const reply = typeof step === "function" ? step(recorded) : step;

    async function* emit(event: StreamEvent): AsyncGenerator<StreamEvent> {
      if (delayMs > 0) {
        await abortableSleep(delayMs, signal);
      }
      signal?.throwIfAborted();
      yield event;
    }

    const text = "fail" in reply ? (reply.afterText ?? "") : (reply.text ?? "");
    const chars = Array.from(text);
    for (let i = 0; i < chars.length; i += chunkSize) {
      yield* emit({ type: "text", text: chars.slice(i, i + chunkSize).join("") });
    }
    if ("fail" in reply) {
      throw reply.fail;
    }

    const calls = reply.toolCalls ?? [];
    for (const call of calls) {
      callCount++;
      const args = call.arguments ?? {};
      yield* emit({
        type: "tool_call",
        call: {
          id: call.id ?? `call_${callCount}`,
          name: call.name,
          arguments: typeof args === "string" ? args : JSON.stringify(args),
        },
      });
    }
    const reason = reply.finishReason ?? (calls.length > 0 ? "tool_calls" : "stop");
    yield* emit(
      reply.usage === undefined
        ? { type: "finish", reason }
        : { type: "finish", reason, usage: reply.usage },
    );
  }

  return {
    stream,
    requests,
    get remaining() {
      return steps.length - next;
    },
  };
}
