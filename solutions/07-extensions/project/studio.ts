/**
 * 第 7 章项目参考答案：把 MCP、子 agent 和检索合成一次运行。
 *
 * mergeTools 在合成时记下名字。runStudio 不关闭传入的 MCP 客户端，连接归调用方。
 */
import {
  createAgent,
  type FunctionDefinition,
  type Message,
  type Model,
  type ToolExecutor,
} from "@learn-ts/agent-kit";
import { createMcpExecutor, type McpToolSource } from "../03-mcp-client.ts";
import { delegate, parentSummary } from "../04-delegate.ts";
import { createRetriever } from "../07-retrieval.ts";

export function mergeTools(executors: readonly ToolExecutor[]): ToolExecutor {
  if (executors.length === 0) {
    throw new Error("至少要有一个工具执行器");
  }
  const schemas: FunctionDefinition[] = [];
  const owner = new Map<string, ToolExecutor>();
  for (const executor of executors) {
    for (const schema of executor.schemas()) {
      if (owner.has(schema.name)) {
        throw new Error(`工具 "${schema.name}" 重复了`);
      }
      owner.set(schema.name, executor);
      schemas.push(structuredClone(schema));
    }
  }
  const names = [...owner.keys()];
  return {
    schemas() {
      return schemas.map((schema) => structuredClone(schema));
    },
    dispatch(call, options) {
      const executor = owner.get(call.name);
      if (executor === undefined) {
        return Promise.resolve({
          id: call.id,
          ok: false,
          content: `未知工具 "${call.name}"。可用的工具：${names.join(", ")}`,
        });
      }
      return executor.dispatch(call, options);
    },
  };
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
  const mcp = await createMcpExecutor(options.client, { prefix: "notes" });
  const retriever = createRetriever({ dimensions: 32 });
  const remembered: string[] = [];

  const local: ToolExecutor = {
    schemas: () => [
      {
        name: "remember",
        description: "记住一条事实",
        parameters: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      },
      {
        name: "recall",
        description: "按一句话查找已经记住的事实",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
      {
        name: "summarize",
        description: "让子 agent 用一句话总结，子 agent 看不到当前对话",
        parameters: {
          type: "object",
          properties: { task: { type: "string" } },
          required: ["task"],
        },
      },
    ],
    async dispatch(call, callOptions) {
      const args = parseObject(call.arguments);
      if (!args.ok) return { id: call.id, ok: false, content: args.error };
      if (call.name === "remember") {
        const text = args.value["text"];
        if (typeof text !== "string" || text.trim() === "") {
          return { id: call.id, ok: false, content: "text 必须是非空字符串" };
        }
        retriever.add(text);
        remembered.push(text);
        return { id: call.id, ok: true, content: "已记住" };
      }
      if (call.name === "recall") {
        const query = args.value["query"];
        if (typeof query !== "string") {
          return { id: call.id, ok: false, content: "query 必须是字符串" };
        }
        const hits = retriever.search(query, 3);
        return {
          id: call.id,
          ok: true,
          content: hits.length === 0 ? "没有找到" : hits.map((hit) => hit.text).join("\n"),
        };
      }
      const task = args.value["task"];
      if (typeof task !== "string" || task.trim() === "") {
        return { id: call.id, ok: false, content: "task 必须是非空字符串" };
      }
      const agent = createAgent({
        model: options.summarizer,
        system: "用一句话总结用户给出的任务，不要调用工具。",
      });
      const result = await delegate(
        agent,
        task,
        callOptions?.signal === undefined ? {} : { signal: callOptions.signal },
      );
      return {
        id: call.id,
        ok: result.stopReason.type === "completed",
        content: parentSummary(result),
      };
    },
  };

  const agent = createAgent({ model: options.model, tools: mergeTools([mcp, local]) });
  const result = await agent.run(
    options.task,
    options.signal === undefined ? {} : { signal: options.signal },
  ).result;
  return {
    text: result.text,
    stopType: result.stopReason.type,
    remembered: [...remembered],
    toolNames: toolNamesOf(result.messages),
  };
}

function toolNamesOf(messages: readonly Message[]): string[] {
  const names: string[] = [];
  for (const message of messages) {
    if (message.role !== "assistant" || message.tool_calls === undefined) continue;
    for (const call of message.tool_calls) names.push(call.function.name);
  }
  return names;
}

function parseObject(
  raw: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { ok: false, error: "参数必须是 JSON 对象" };
    }
    return { ok: true, value: { ...(value as Record<string, unknown>) } };
  } catch {
    return { ok: false, error: "参数不是合法的 JSON" };
  }
}
