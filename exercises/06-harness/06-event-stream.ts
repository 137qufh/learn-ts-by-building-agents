/**
 * 练习 6-6：给界面的事件流
 *
 * 课程：chapters/06-harness/06-event-stream.md
 * 运行：pnpm ex 06-event-stream
 *
 * harness 运行时，界面要实时显示：模型正在输出的文字、正在执行的工具、每个工具的结果……
 * harness 的主循环是"推"（发生一件事就交出一个事件），使用者是"拉"（for await 一个个取）。
 * 这道题写连接两者的通道，以及让事件处理函数有精确类型的几个类型工具。
 *
 * 第一部分（类型）：EventOf、EventHandlers
 *   - EventOf<K>：AgentEvent 里 type 是 K 的那些成员（提示：Extract，2.7 节）
 *   - EventHandlers：每种事件一个可选的处理函数，参数是那一种事件。
 *     比如 { text?: (event: EventOf<"text">) => void; done?: (event: EventOf<"done">) => void; ... }
 *     （提示：映射类型，2.3 节）
 *   类型测试在 06-event-stream.test-d.ts。
 *
 * 第二部分：dispatchEvent(event, handlers)
 *   把事件交给对应类型的处理函数，没有处理函数时什么都不做。
 *   如果把参数写成 event: AgentEvent，handlers[event.type]?.(event) 会报"参数类型是 never"：
 *   这是 2.8 节的"关联的联合"。签名已经按 2.8 节的办法写成了以事件类型 K 为类型参数的泛型，
 *   EventOf 和 EventHandlers 写对之后，函数体一行就够了，不需要 as。
 *
 * 第三部分：createChannel<T>()
 *   - push(value)：放进缓冲区，唤醒正在等待的消费者，返回 true。已经关闭、或者消费者已经离开时忽略，返回 false
 *   - close()：关闭。消费者取完缓冲区里的值之后结束
 *   - fail(error)：关闭，消费者取完缓冲区里的值之后，遍历抛出 error。已经关闭时没有效果
 *   - closed：是否已经关闭（getter）
 *   - [Symbol.asyncIterator]()：只能调用一次，第二次抛出 Error("通道只能被遍历一次")
 *   - 消费者离开（遍历结束，包括 for await 里 break）之后，清空缓冲区，之后的 push 返回 false
 *   - 缓冲区没有上限：没有人遍历时，值一直留着
 *   提示：用异步生成器实现遍历，生成器的 finally 在 break 时也会执行（3.8 节）；
 *   消费者等待时，把一个 Promise 的 resolve 存起来，push 时调用它。
 */
import type { RawToolCall, Usage } from "@learn-ts/agent-kit";
import { todo, type Todo } from "../todo.ts";
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

export type EventOf<K extends AgentEventType> = Todo;

export type EventHandlers = Todo;

export function dispatchEvent<K extends AgentEventType>(
  event: EventOf<K>,
  handlers: EventHandlers,
): void {
  todo("实现 dispatchEvent");
}

export interface Channel<T> extends AsyncIterable<T> {
  push(value: T): boolean;
  close(): void;
  fail(error: unknown): void;
  readonly closed: boolean;
}

export function createChannel<T>(): Channel<T> {
  return todo("实现 createChannel");
}
