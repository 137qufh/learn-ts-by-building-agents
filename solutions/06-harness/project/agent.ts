/**
 * 第 6 章项目参考答案：把前八节的零件组装成 agent harness
 */
import {
  addUsage,
  type ChatRequest,
  type Message,
  type RawToolCall,
  type Usage,
} from "@learn-ts/agent-kit";
import { assistantMessage, type Model, type ToolExecutor } from "../01-agent-loop.ts";
import { runToolCalls } from "../03-parallel-tools.ts";
import { fitToBudget, truncateMiddle } from "../04-context-window.ts";
import {
  afterTurn,
  createRepeatDetector,
  repairHistory,
  shouldRetryStep,
  type AgentResult,
  type StopReason,
} from "../05-stop-and-recover.ts";
import { createChannel, type AgentEvent } from "../06-event-stream.ts";
import {
  runAfterStep,
  runBeforeModel,
  toolPipeline,
  type AgentMiddleware,
  type ToolOutcome,
} from "../07-middleware.ts";
import { noopTracer, type Span, type Tracer } from "../08-tracing.ts";

export interface AgentOptions {
  model: Model;
  tools?: ToolExecutor;
  system?: string;
  maxSteps?: number;
  maxParallelTools?: number;
  toolTimeoutMs?: number;
  contextTokens?: number;
  maxToolResultChars?: number;
  modelRetries?: number;
  repeatLimit?: number;
  middleware?: readonly AgentMiddleware[];
  tracer?: Tracer;
  temperature?: number;
  maxTokens?: number;
}

export interface RunOptions {
  history?: readonly Message[];
  signal?: AbortSignal;
}

export interface AgentRun extends AsyncIterable<AgentEvent> {
  readonly result: Promise<AgentResult>;
}

export interface Agent {
  run(input: string, options?: RunOptions): AgentRun;
}

export const NO_TOOLS = "没有可用的工具";

export function repeatedContent(times: number): string {
  return `没有执行：同样的调用已经连续出现了 ${times} 次，harness 停止了这次运行`;
}

export function createAgent(options: AgentOptions): Agent {
  const {
    model,
    tools,
    system,
    maxSteps = 20,
    maxParallelTools = 4,
    toolTimeoutMs = 60_000,
    contextTokens,
    maxToolResultChars = 20_000,
    modelRetries = 1,
    repeatLimit = 3,
    middleware = [],
    tracer = noopTracer,
  } = options;

  const execute = toolPipeline(middleware, async ({ call, signal }): Promise<ToolOutcome> => {
    if (tools === undefined) {
      return { ok: false, content: NO_TOOLS };
    }
    const { ok, content } = await tools.dispatch(call, { signal });
    return { ok, content };
  });

  function startMessages(input: string, history: readonly Message[]): Message[] {
    const messages = [...history];
    if (system !== undefined && messages[0]?.role !== "system") {
      messages.unshift({ role: "system", content: system });
    }
    messages.push({ role: "user", content: input });
    return messages;
  }

  async function loop(
    messages: Message[],
    emit: (event: AgentEvent) => void,
    signal: AbortSignal | undefined,
    runSpan: Span,
    state: { steps: number; usage: Usage },
  ): Promise<StopReason> {
    const repeats = createRepeatDetector(repeatLimit);
    const schemas = tools?.schemas() ?? [];

    for (let step = 1; ; step++) {
      if (step > maxSteps) {
        return { type: "max_steps", maxSteps };
      }
      state.steps = step;
      const stepSpan = tracer.start("step", { parent: runSpan, attributes: { step } });
      emit({ type: "step_start", step });
      try {
        // ── 1. 构造请求：上下文预算 → 中间件 ──
        let window = messages;
        if (contextTokens !== undefined) {
          const fitted = fitToBudget(messages, contextTokens);
          window = fitted.messages;
          if (fitted.dropped > 0) {
            emit({ type: "context_trimmed", step, dropped: fitted.dropped, tokens: fitted.tokens });
          }
        }
        let request: ChatRequest = { messages: [...window] };
        if (schemas.length > 0) request.tools = schemas;
        if (options.temperature !== undefined) request.temperature = options.temperature;
        if (options.maxTokens !== undefined) request.maxTokens = options.maxTokens;
        request = await runBeforeModel(middleware, request, { step, messages: [...messages] });

        // ── 2. 调用模型，边收边转发；流中途出错时整步重试 ──
        let text = "";
        let toolCalls: RawToolCall[] = [];
        let finishReason = "unknown";
        for (let attempt = 0; ; attempt++) {
          const modelSpan = tracer.start("model", {
            parent: stepSpan,
            attributes: { attempt, messages: request.messages.length },
          });
          text = "";
          toolCalls = [];
          try {
            for await (const event of model.stream(
              request,
              signal === undefined ? {} : { signal },
            )) {
              if (event.type === "text") {
                text += event.text;
                emit({ type: "text", step, text: event.text });
              } else if (event.type === "tool_call") {
                toolCalls.push(event.call);
                emit({ type: "tool_call", step, call: event.call });
              } else {
                finishReason = event.reason;
                if (event.usage !== undefined) {
                  state.usage = addUsage(state.usage, event.usage);
                  modelSpan.set("usage", event.usage);
                }
                emit(
                  event.usage === undefined
                    ? { type: "model_end", step, finishReason }
                    : { type: "model_end", step, finishReason, usage: event.usage },
                );
              }
            }
            modelSpan.set("finishReason", finishReason);
            modelSpan.end();
            break;
          } catch (error) {
            modelSpan.fail(error);
            if (signal?.aborted) {
              // 中断时已经显示给用户的文字留在记录里：用户看到了它，下一轮的模型也应该知道
              if (text !== "") messages.push({ role: "assistant", content: text });
              return { type: "cancelled" };
            }
            const failure = error instanceof Error ? error : new Error(String(error));
            if (attempt >= modelRetries || !shouldRetryStep(error, signal)) {
              return { type: "error", error: failure };
            }
            emit({ type: "step_retry", step, attempt: attempt + 1, error: failure });
          }
        }

        // ── 3. 记录回复，决定下一步 ──
        messages.push(assistantMessage({ text, toolCalls }));
        const decision = afterTurn(finishReason, toolCalls.length);
        if (decision !== "run_tools") {
          return decision;
        }
        const repeated = repeats.check(toolCalls);
        if (repeated !== undefined) {
          for (const call of toolCalls) {
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: repeatedContent(repeated.times),
            });
          }
          return { type: "repeated_tool_calls", ...repeated };
        }

        // ── 4. 执行工具：并行、超时、取消，结果按调用的顺序追加 ──
        const runs = await runToolCalls(
          toolCalls,
          (call, callSignal) => {
            const toolSpan = tracer.start(`tool ${call.name}`, {
              parent: stepSpan,
              attributes: { id: call.id },
            });
            return execute({ call, step, signal: callSignal }).then(
              (outcome) => {
                toolSpan.set("ok", outcome.ok);
                toolSpan.end();
                return outcome;
              },
              (error: unknown) => {
                toolSpan.fail(error);
                throw error;
              },
            );
          },
          {
            concurrency: maxParallelTools,
            timeoutMs: toolTimeoutMs,
            ...(signal === undefined ? {} : { signal }),
            onResult: (result) => emit({ type: "tool_result", step, result }),
          },
        );
        for (const run of runs) {
          messages.push({
            role: "tool",
            tool_call_id: run.id,
            content: truncateMiddle(run.content, maxToolResultChars),
          });
        }
        if (signal?.aborted) {
          return { type: "cancelled" };
        }

        // ── 5. 中间件决定要不要提前停下 ──
        const stop = await runAfterStep(middleware, { step, messages: [...messages] });
        if (stop !== undefined) {
          return { type: "stopped_by_middleware", ...stop };
        }
      } finally {
        stepSpan.end();
      }
    }
  }

  function run(input: string, runOptions: RunOptions = {}): AgentRun {
    const { history = [], signal } = runOptions;
    const channel = createChannel<AgentEvent>();
    const messages = startMessages(input, history);
    const runSpan = tracer.start("agent.run", { attributes: { maxSteps } });

    const result = (async (): Promise<AgentResult> => {
      const state = { steps: 0, usage: { inputTokens: 0, outputTokens: 0 } };
      let stopReason: StopReason;
      try {
        stopReason = await loop(messages, (event) => channel.push(event), signal, runSpan, state);
      } catch (error) {
        // 中间件抛出的意外错误：同样以结果的形式交出去，聊天记录不丢
        stopReason = signal?.aborted
          ? { type: "cancelled" }
          : { type: "error", error: error instanceof Error ? error : new Error(String(error)) };
      }
      const repaired = repairHistory(messages);
      const last = repaired.findLast((message) => message.role === "assistant");
      const agentResult: AgentResult = {
        messages: repaired,
        text: last?.content ?? "",
        steps: state.steps,
        usage: state.usage,
        stopReason,
      };
      runSpan.set("stopReason", stopReason.type);
      if (stopReason.type === "error") {
        runSpan.fail(stopReason.error);
      } else {
        runSpan.end();
      }
      channel.push({ type: "done", result: agentResult });
      channel.close();
      return agentResult;
    })();

    return {
      result,
      [Symbol.asyncIterator]: () => channel[Symbol.asyncIterator](),
    };
  }

  return { run };
}
