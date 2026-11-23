import type { RawToolCall } from "@learn-ts/agent-kit";
import { expectTypeOf, test } from "vitest";
import {
  dispatchEvent,
  type AgentEvent,
  type EventHandlers,
  type EventOf,
} from "./06-event-stream.ts";

test("EventOf 取出某一种事件", () => {
  expectTypeOf<EventOf<"text">>().toEqualTypeOf<{ type: "text"; step: number; text: string }>();
  expectTypeOf<EventOf<"tool_call">>().toEqualTypeOf<{
    type: "tool_call";
    step: number;
    call: RawToolCall;
  }>();
  expectTypeOf<EventOf<"text" | "step_start">>().toEqualTypeOf<
    { type: "text"; step: number; text: string } | { type: "step_start"; step: number }
  >();
});

test("EventHandlers：每种事件一个可选的处理函数，参数是那一种事件", () => {
  expectTypeOf<keyof EventHandlers>().toEqualTypeOf<AgentEvent["type"]>();
  expectTypeOf<Required<EventHandlers>["text"]>().toEqualTypeOf<(event: EventOf<"text">) => void>();
  expectTypeOf<EventHandlers["done"]>().toEqualTypeOf<
    ((event: EventOf<"done">) => void) | undefined
  >();

  // 处理函数里不需要再收窄
  const handlers: EventHandlers = {
    text: (event) => expectTypeOf(event.text).toBeString(),
    tool_call: (event) => expectTypeOf(event.call).toEqualTypeOf<RawToolCall>(),
  };
  dispatchEvent({ type: "step_start", step: 1 }, handlers);

  // @ts-expect-error 处理函数的参数类型必须和事件对应
  const wrong: EventHandlers = { text: (event: EventOf<"done">) => event };
  void wrong;
  // @ts-expect-error 不存在的事件类型
  const unknown: EventHandlers = { nope: () => {} };
  void unknown;
});
