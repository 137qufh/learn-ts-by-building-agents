/**
 * @learn-ts/agent-kit/zod：用 Zod 定义工具、校验模型的输出（第 5 章）。
 *
 * 单独作为一个子路径导出，并且 zod 是 peerDependency：
 * - 只用主入口的使用者不需要安装 zod，主入口也不会加载它
 * - 用这个入口的使用者自己安装 zod，和这里用的是同一份，schema 和 ZodError 才能互通
 */

export {
  defineFunction,
  strictFunction,
  strictProblems,
  toolParameters,
  type FunctionSchema,
  type JsonSchema,
  type StrictProblem,
} from "./json-schema.ts";

export {
  extractJson,
  feedbackFor,
  formatPath,
  generateValidated,
  issuesForModel,
  parseToolArguments,
  type ChatTurn,
  type ExtractResult,
  type Generate,
  type GenerateOptions,
  type ParseResult,
  type ValidatedResult,
} from "./model-output.ts";

export {
  createToolbox,
  defineTool,
  toContent,
  type AnyZodTool,
  type ArgsInput,
  type CallOptions,
  type ResultOf,
  type ToolByName,
  type ToolContext,
  type ToolName,
  type ToolResult,
  type Toolbox,
  type ZodTool,
} from "./toolbox.ts";
