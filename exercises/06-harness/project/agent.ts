/**
 * 第 6 章项目：agent harness
 *
 * 课程：chapters/06-harness/09-project-harness.md
 * 运行：pnpm ex project/agent
 *
 * 把前八节的零件组装成一个真正能用的 harness：
 *
 *   const agent = createAgent({ model: client, tools: toolbox, system: "你是……", middleware: [...], tracer });
 *   const run = agent.run("帮我看看 src 里有哪些 TODO", { signal });
 *   for await (const event of run) { ...显示... }   // 事件流（6.6 节）
 *   const result = await run.result;                 // { messages, text, steps, usage, stopReason }
 *
 * agent 本身没有状态：对话的状态全在 messages 里。想接着聊，把 result.messages 作为下一次的 history。
 *
 * run(input, { history = [], signal })
 *   - 立刻开始运行（不等有人遍历事件），返回 AgentRun：可以 for await 事件，result 是最终结果
 *   - 初始记录：history 的副本；给了 system 而且 history 的第一条不是 system 消息时，在最前面加上
 *     { role: "system", content: system }；最后追加 { role: "user", content: input }
 *   - 事件推进一个通道（练习 6-6），最后推一个 done 事件，然后关闭
 *   - result **永远不会拒绝**：任何意外的错误（比如中间件抛出）都变成 stopReason { type: "error" }
 *     （这时已经取消的话是 cancelled）。结果的 messages 经过 repairHistory（练习 6-5）；
 *     text 是最后一条 assistant 消息的 content（没有或者是 null 时是 ""）
 *
 * 每一步（step 从 1 开始；已经执行了 maxSteps 步时停下：{ type: "max_steps", maxSteps }）
 *   1. 发出 step_start
 *   2. 请求：{ messages, tools, temperature, maxTokens }（没有的不写）
 *      - 给了 contextTokens 时，messages 是 fitToBudget(记录, contextTokens) 的结果（练习 6-4），
 *        有省略时发出 context_trimmed；完整的记录不受影响
 *      - tools 是 tools.schemas()，为空时不写
 *      - 然后交给 runBeforeModel（练习 6-7），info 是 { step, messages: 记录的副本 }
 *   3. model.stream(request, { signal })，边收边发出事件：text、tool_call，finish 时发出 model_end
 *      （带上 usage），并把 usage 加进总用量（addUsage）
 *      - 流出错，已经取消：已经收到的文字不为空时，作为一条 assistant 消息留在记录里；停下（cancelled）
 *      - 流出错，shouldRetryStep 说可以重试，而且重试次数还没超过 modelRetries：发出 step_retry
 *        （attempt 从 1 开始），丢掉这次收到的文字和调用，整步重来
 *      - 否则停下：{ type: "error", error }（不是 Error 时包装成 Error）
 *   4. 把 assistantMessage（练习 6-1）追加进记录，用 afterTurn（练习 6-5）决定要不要继续
 *   5. createRepeatDetector(repeatLimit) 检查这一批调用；重复了就给每个调用追加一条结果
 *      repeatedContent(times)，停下：{ type: "repeated_tool_calls", name, times }
 *   6. runToolCalls（练习 6-3）执行工具：concurrency 是 maxParallelTools，timeoutMs 是 toolTimeoutMs，
 *      signal 传进去，每个结果发出 tool_result。execute 经过 toolPipeline（练习 6-7）；最里层调用
 *      tools.dispatch(call, { signal })，没有 tools 时结果是 { ok: false, content: NO_TOOLS }。
 *      结果按调用的顺序追加进记录，content 用 truncateMiddle 截到 maxToolResultChars
 *   7. 已经取消：停下（cancelled）。否则 runAfterStep，有中间件要求停下：
 *      { type: "stopped_by_middleware", middleware, reason }
 *
 * 追踪（练习 6-8，没有 tracer 时用 noopTracer）
 *   agent.run（attributes: maxSteps；结束时 set("stopReason", 类型)，error 时 fail）
 *     step（attributes: step）
 *       model（每次尝试一个；attributes: attempt、messages 条数；成功时 set finishReason、usage；出错时 fail）
 *       tool ${name}（每个调用一个；attributes: id；成功时 set("ok", ok)）
 *
 * 默认值：maxSteps 20、maxParallelTools 4、toolTimeoutMs 60_000、maxToolResultChars 20_000、
 *        modelRetries 1、repeatLimit 3、middleware []
 */
import type { Message } from "@learn-ts/agent-kit";
import { todo } from "../../todo.ts";
import type { Model, ToolExecutor } from "../01-agent-loop.ts";
import type { AgentResult } from "../05-stop-and-recover.ts";
import type { AgentEvent } from "../06-event-stream.ts";
import type { AgentMiddleware } from "../07-middleware.ts";
import type { Tracer } from "../08-tracing.ts";

export interface AgentOptions {
  model: Model;
  tools?: ToolExecutor;
  system?: string;
  maxSteps?: number;
  maxParallelTools?: number;
  toolTimeoutMs?: number;
  /** 发给模型的记录最多多少 token（估算）；不设置就不省略 */
  contextTokens?: number;
  maxToolResultChars?: number;
  /** 流中途出错时，同一步最多重试几次 */
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
  return todo("实现 createAgent");
}
