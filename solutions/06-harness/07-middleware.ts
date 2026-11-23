/**
 * 练习 6-7 参考答案：钩子与中间件
 */
import type { ChatRequest, Message, RawToolCall } from "@learn-ts/agent-kit";

export type Next<A, R> = (input: A) => Promise<R>;
export type Wrapper<A, R> = (input: A, next: Next<A, R>) => Promise<R>;

export function compose<A, R>(wrappers: readonly Wrapper<A, R>[], handler: Next<A, R>): Next<A, R> {
  return (input) => {
    const dispatch = (index: number, value: A): Promise<R> => {
      const wrapper = wrappers[index];
      if (wrapper === undefined) {
        return Promise.try(() => handler(value));
      }
      let called = false;
      return Promise.try(() =>
        wrapper(value, (nextValue) => {
          if (called) {
            return Promise.reject(new Error("next() 被调用了多次"));
          }
          called = true;
          return dispatch(index + 1, nextValue);
        }),
      );
    };
    return dispatch(0, input);
  };
}

export interface StepInfo {
  step: number;
  messages: readonly Message[];
}

export interface ToolInvocation {
  call: RawToolCall;
  step: number;
  signal: AbortSignal;
}

export interface ToolOutcome {
  ok: boolean;
  content: string;
}

export interface AgentMiddleware {
  name: string;
  beforeModel?: (
    request: ChatRequest,
    info: StepInfo,
  ) => ChatRequest | undefined | Promise<ChatRequest | undefined>;
  wrapToolCall?: Wrapper<ToolInvocation, ToolOutcome>;
  afterStep?: (
    info: StepInfo,
  ) => { stop: string } | undefined | Promise<{ stop: string } | undefined>;
}

export async function runBeforeModel(
  middleware: readonly AgentMiddleware[],
  request: ChatRequest,
  info: StepInfo,
): Promise<ChatRequest> {
  let current = request;
  for (const item of middleware) {
    current = (await item.beforeModel?.(current, info)) ?? current;
  }
  return current;
}

export async function runAfterStep(
  middleware: readonly AgentMiddleware[],
  info: StepInfo,
): Promise<{ middleware: string; reason: string } | undefined> {
  for (const item of middleware) {
    const decision = await item.afterStep?.(info);
    if (decision !== undefined) {
      return { middleware: item.name, reason: decision.stop };
    }
  }
  return undefined;
}

export function toolPipeline(
  middleware: readonly AgentMiddleware[],
  execute: Next<ToolInvocation, ToolOutcome>,
): Next<ToolInvocation, ToolOutcome> {
  const wrappers = middleware.flatMap((item) =>
    item.wrapToolCall === undefined ? [] : [item.wrapToolCall],
  );
  return compose(wrappers, execute);
}

export function requireApproval(
  tools: readonly string[],
  ask: (call: RawToolCall) => boolean | Promise<boolean>,
): AgentMiddleware {
  const guarded = new Set(tools);
  return {
    name: "require-approval",
    async wrapToolCall(invocation, next) {
      if (!guarded.has(invocation.call.name)) {
        return next(invocation);
      }
      if (await ask(invocation.call)) {
        return next(invocation);
      }
      return {
        ok: false,
        content: `用户拒绝了这次 ${invocation.call.name} 调用。不要重试同样的操作，换一种做法或者直接回答。`,
      };
    },
  };
}
