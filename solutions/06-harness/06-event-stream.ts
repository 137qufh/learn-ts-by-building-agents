/**
 * 练习 6-6 参考答案：给界面的事件流
 */
import type { RawToolCall, Usage } from "@learn-ts/agent-kit";
import type { ToolRun } from "./03-parallel-tools.ts";
import type { AgentResult } from "./05-stop-and-recover.ts";

export type AgentEvent =
  /** 开始第 step 步（一次模型调用） */
  | { type: "step_start"; step: number }
  /** 模型输出的一段文字 */
  | { type: "text"; step: number; text: string }
  /** 模型请求调用一个工具 */
  | { type: "tool_call"; step: number; call: RawToolCall }
  /** 一个工具调用完成了（按完成的顺序） */
  | { type: "tool_result"; step: number; result: ToolRun }
  /** 模型的流中途出错，这一步要重来：界面应该丢掉这一步已经显示的文字 */
  | { type: "step_retry"; step: number; attempt: number; error: Error }
  /** 聊天记录超出预算，这一步发给模型的是省略后的版本 */
  | { type: "context_trimmed"; step: number; dropped: number; tokens: number }
  /** 模型这一步说完了 */
  | { type: "model_end"; step: number; finishReason: string; usage?: Usage }
  /** 运行结束，最后一个事件 */
  | { type: "done"; result: AgentResult };

export type AgentEventType = AgentEvent["type"];

export type EventOf<K extends AgentEventType> = Extract<AgentEvent, { type: K }>;

export type EventHandlers = { [K in AgentEventType]?: (event: EventOf<K>) => void };

export function dispatchEvent<K extends AgentEventType>(
  event: EventOf<K>,
  handlers: EventHandlers,
): void {
  // 参数写成 event: AgentEvent 的话，handlers[event.type] 是"每种事件的处理函数"组成的联合，
  // 调用它要求参数同时满足所有事件，也就是 never（2.8 节的关联联合）。
  // 以事件类型 K 为类型参数，handlers[event.type] 和 event 用的是同一个 K，TypeScript 就能看出它们是配对的
  handlers[event.type]?.(event);
}

export interface Channel<T> extends AsyncIterable<T> {
  push(value: T): boolean;
  close(): void;
  fail(error: unknown): void;
  readonly closed: boolean;
}

export function createChannel<T>(): Channel<T> {
  const buffer: T[] = [];
  let closed = false;
  let failure: { error: unknown } | undefined;
  let consumerGone = false;
  let iterated = false;
  let wake: (() => void) | undefined;

  const notify = (): void => {
    wake?.();
    wake = undefined;
  };

  async function* iterate(): AsyncGenerator<T> {
    try {
      while (true) {
        if (buffer.length > 0) {
          yield buffer.shift()!;
          continue;
        }
        if (failure !== undefined) {
          throw failure.error;
        }
        if (closed) {
          return;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      // 正常结束、出错、或者 for await 里 break（生成器的 return 会走到这里）
      consumerGone = true;
      buffer.length = 0;
    }
  }

  return {
    push(value) {
      if (closed || consumerGone) {
        return false;
      }
      buffer.push(value);
      notify();
      return true;
    },
    close() {
      closed = true;
      notify();
    },
    fail(error) {
      if (closed) {
        return;
      }
      failure = { error };
      closed = true;
      notify();
    },
    get closed() {
      return closed;
    },
    [Symbol.asyncIterator]() {
      if (iterated) {
        throw new Error("通道只能被遍历一次");
      }
      iterated = true;
      return iterate();
    },
  };
}
