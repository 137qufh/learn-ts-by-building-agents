/**
 * 章末项目：MCP 笔记、记忆和子 agent 接在同一个 harness 上
 *
 * 课程：chapters/07-extensions/10-project-studio.md
 * 运行：pnpm ex project/studio
 *
 * mergeTools(executors) 把多个 ToolExecutor 合成一个。
 * 名字在调用时就固定。重名抛出 Error，消息包含这个名字。空数组抛出 Error。
 * 未知工具返回 ok false，content 里有可用的名字。schemas() 每次返回新拷贝。
 *
 * runStudio({ model, summarizer, client, task, signal? })：
 * - 用 createMcpExecutor 把 client 的工具加上 notes__ 前缀。
 * - 再加三个本地工具：remember({ text })、recall({ query })、summarize({ task })。
 *   remember 写进 createRetriever，recall 用它搜索，最多 3 条，没有就 "没有找到"。
 *   summarize 用 delegate 跑一个没有工具的子 agent，system 是
 *   "用一句话总结用户给出的任务，不要调用工具。"
 *   子 agent 完成时 ok true，content 是 parentSummary；没完成时 ok false，content 仍是 parentSummary。
 * - 用 mergeTools 合成后交给 createAgent。不关闭 client。
 * - 返回 { text, stopType, remembered, toolNames }。
 *   remembered 是成功记住的文本。toolNames 是 assistant 消息里工具名的顺序。
 */
import type { Model, ToolExecutor } from "@learn-ts/agent-kit";
import type { McpToolSource } from "../03-mcp-client.ts";
import { todo } from "../../todo.ts";

export function mergeTools(executors: readonly ToolExecutor[]): ToolExecutor {
  return todo("实现 mergeTools");
}

export interface StudioOptions {
  model: Model;
  summarizer: Model;
  client: McpToolSource;
  task: string;
  signal?: AbortSignal;
}

export interface StudioResult {
  text: string;
  stopType: string;
  remembered: string[];
  toolNames: string[];
}

export async function runStudio(options: StudioOptions): Promise<StudioResult> {
  return todo("实现 runStudio");
}
