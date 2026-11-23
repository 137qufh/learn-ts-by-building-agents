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
