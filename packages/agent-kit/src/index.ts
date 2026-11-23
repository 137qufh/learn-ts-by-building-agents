/**
 * @learn-ts/agent-kit 的公开接口。
 *
 * 这里列出的就是这个包对使用者的全部承诺（4.3 节的语义化版本）：
 * 没有从这里导出的东西都是内部实现，可以随时修改。
 */

// ── 工具注册表（第 2 章） ──────────────────────────────────────────────
export {
  createRegistry,
  defineTool,
  toSchema,
  validateArgs,
  type AnyTool,
  type ArgsOf,
  type DispatchResult,
  type InferArgs,
  type JsonSchemaProperty,
  type ParamSpec,
  type ParamsSpec,
  type RawToolCall,
  type ResultOf,
  type Tool,
  type ToolByName,
  type ToolName,
  type ToolRegistry,
  type ToolSchema,
  type Validation,
} from "./registry.ts";

// ── 模型客户端（第 3 章） ──────────────────────────────────────────────
export {
  createClient,
  type CallOptions,
  type ChatRequest,
  type ChatResult,
  type ClientOptions,
  type FetchLike,
  type FunctionDefinition,
  type LlmClient,
  type Message,
  type StreamEvent,
  type WireToolCall,
} from "./client.ts";

// ── 客户端用到的基础设施，单独使用也很方便 ──────────────────────────────
export {
  ApiError,
  attemptAsync,
  errorFromResponse,
  formatErrorChain,
  isRetryable,
  toError,
  type Result,
} from "./errors.ts";
export { abortableSleep, isAbortError, isTimeoutError, raceAbort, withTimeout } from "./abort.ts";
export {
  backoffDelay,
  fullJitter,
  parseRetryAfter,
  retry,
  type RetryInfo,
  type RetryOptions,
} from "./retry.ts";
export { batch, collect, idleTimeout, mapAsync, take } from "./streams.ts";
export { parseSse, readSse, type SseEvent } from "./sse.ts";
export { addUsage, estimateCost, totalTokens, type Pricing, type Usage } from "./usage.ts";

// ── agent harness（第 6 章） ──────────────────────────────────────────
// 只导出使用者组装、扩展、测试 harness 时需要的东西。主循环内部的决策函数
// （afterTurn、重复检测、中间件的执行顺序……）和给模型看的提示文字都不导出：
// 它们是实现细节，以后可以随时调整，不需要升级大版本（4.3 节）
export {
  createAgent,
  type Agent,
  type AgentOptions,
  type AgentRun,
  type RunOptions,
} from "./agent/agent.ts";
export {
  assistantMessage,
  collectTurn,
  type Model,
  type ToolExecutor,
  type Turn,
} from "./agent/loop.ts";
export {
  runToolCalls,
  type ExecuteTool,
  type RunToolsOptions,
  type ToolRun,
  type ToolStatus,
} from "./agent/tools.ts";
export {
  estimateTokens,
  fitToBudget,
  groupTurns,
  messageTokens,
  truncateMiddle,
  type FitResult,
} from "./agent/context.ts";
export { repairHistory, type AgentResult, type StopReason } from "./agent/recovery.ts";
export {
  createChannel,
  dispatchEvent,
  type AgentEvent,
  type AgentEventType,
  type Channel,
  type EventHandlers,
  type EventOf,
} from "./agent/events.ts";
export {
  compose,
  requireApproval,
  type AgentMiddleware,
  type Next,
  type StepInfo,
  type ToolInvocation,
  type ToolOutcome,
  type Wrapper,
} from "./agent/middleware.ts";
export {
  createRecordingTracer,
  isSecretKey,
  noopTracer,
  redact,
  toJsonLine,
  traced,
  type Attributes,
  type RecordingTracer,
  type RecordingTracerOptions,
  type Span,
  type SpanOptions,
  type SpanRecord,
  type Tracer,
} from "./agent/tracing.ts";

// ── 扩展：MCP 适配、多 agent、记忆、评测（第 7 章）────────────────
// MCP 适配器不 import SDK，只要求 listTools / callTool。官方 Client 结构上符合。
// 编排、摘要、检索、评测都是纯函数，离线就能测，所以放在主入口而不是新的子路径。
export {
  createMcpExecutor,
  type McpContentBlock,
  type McpExecutorOptions,
  type McpListedTool,
  type McpToolResult,
  type McpToolSource,
} from "./mcp-tools.ts";
export { delegate, parentSummary, type DelegateOptions, type DelegateResult } from "./delegate.ts";
export { shareContext, type SharePolicy } from "./share-context.ts";
export {
  orchestrate,
  type OrchestrateOptions,
  type OrchestrateResult,
  type OrchestratorState,
  type RouteDecision,
  type Specialist,
} from "./orchestrate.ts";
export { compactMessages, type CompactResult } from "./compact.ts";
export { createMemoryStore, type MemoryItem, type MemoryStore } from "./memory.ts";
export {
  cosine,
  createLocalEmbedder,
  createRetriever,
  type Embedder,
  type Retrieved,
  type Retriever,
  type RetrieverOptions,
} from "./retrieve.ts";
export { mergeTools } from "./merge-tools.ts";
export {
  compareBaseline,
  parseJudge,
  runEval,
  type BaselineComparison,
  type EvalCase,
  type EvalExpect,
  type EvalFailure,
  type EvalOutcome,
  type EvalReport,
  type JudgeResult,
  type Regression,
  type RubricScore,
  type ScorePoint,
  type TranscriptTurn,
} from "./eval.ts";

// 用 Zod 定义工具（第 5 章）在单独的入口 @learn-ts/agent-kit/zod 里，见 ./zod/index.ts
