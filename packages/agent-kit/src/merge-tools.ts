/**
 * 把几个 ToolExecutor 合成一个（第 7 章）。
 * 名字在合成时就确定：之后某一边的 schemas() 变了，这里不会悄悄跟上。
 */
import type { FunctionDefinition } from "./client.ts";
import type { RawToolCall } from "./registry.ts";
import type { ToolExecutor } from "./agent/loop.ts";

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
    dispatch(call: RawToolCall, options?: { signal?: AbortSignal }) {
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
