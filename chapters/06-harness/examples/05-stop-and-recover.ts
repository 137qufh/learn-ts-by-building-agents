// 6.5 停止条件与错误恢复
// 运行：pnpm tsx chapters/06-harness/examples/05-stop-and-recover.ts

// ── 1. 停止原因：可辨识联合 + 穷尽检查 ───────────────────────────────
type StopReason =
  | { type: "completed" }
  | { type: "max_steps"; maxSteps: number }
  | { type: "length" }
  | { type: "cancelled" }
  | { type: "error"; error: Error };

function describe(reason: StopReason): string {
  switch (reason.type) {
    case "completed":
      return "完成";
    case "max_steps":
      return `达到了 ${reason.maxSteps} 步的上限`;
    case "length":
      return "回答被截断了";
    case "cancelled":
      return "被用户取消";
    case "error":
      return `出错：${reason.error.message}`;
    default: {
      const unreachable: never = reason; // 加了新的原因却忘了处理，这里会报错
      return unreachable;
    }
  }
}
console.log(describe({ type: "max_steps", maxSteps: 20 })); // 达到了 20 步的上限

// ── 2. 参数的"同样"：键排序之后再比较 ─────────────────────────────────
function stableStringify(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => stableStringify(item ?? null)).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const first: string = '{"path":"a.ts","maxLines":50}';
const second: string = '{ "maxLines": 50, "path": "a.ts" }';
console.log(`\n原文相同吗？${first === second}`); // false
console.log(
  `解析后相同吗？${stableStringify(JSON.parse(first)) === stableStringify(JSON.parse(second))}`,
); // true

// ── 3. 修复记录：每个调用一个结果 ─────────────────────────────────────
type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string }[] }
  | { role: "tool"; tool_call_id: string; content: string };

function repairHistory(messages: readonly Message[], note: string): Message[] {
  const repaired: Message[] = [];
  let pending: string[] = [];
  const flush = (): void => {
    for (const id of pending) repaired.push({ role: "tool", tool_call_id: id, content: note });
    pending = [];
  };
  for (const message of messages) {
    if (message.role === "tool") {
      const index = pending.indexOf(message.tool_call_id);
      if (index !== -1) {
        pending.splice(index, 1);
        repaired.push(message);
      }
      continue;
    }
    flush();
    repaired.push(message);
    if (message.role === "assistant") pending = (message.tool_calls ?? []).map((call) => call.id);
  }
  flush();
  return repaired;
}

// 运行在两个工具执行到一半时被打断：只有 c1 有结果
const broken: Message[] = [
  { role: "user", content: "读 a.ts 和 b.ts" },
  { role: "assistant", content: null, tool_calls: [{ id: "c1" }, { id: "c2" }] },
  { role: "tool", tool_call_id: "c1", content: "a.ts 的内容" },
];
console.log("\n修复后：");
for (const message of repairHistory(broken, "（没有结果：运行被中断了）")) {
  console.log(
    `  ${message.role}${message.role === "tool" ? `(${message.tool_call_id})` : ""}: ${message.content ?? "（调用工具）"}`,
  );
}
//   user: 读 a.ts 和 b.ts
//   assistant: （调用工具）
//   tool(c1): a.ts 的内容
//   tool(c2): （没有结果：运行被中断了）   ← 补上的

// ── 4. 重试放大 ───────────────────────────────────────────────────────
// 每一层都"失败了就再试 3 次"，一次故障会变成多少个请求？
let requests = 1;
console.log();
for (const layer of ["客户端", "harness", "调用 agent 的服务"]) {
  requests *= 1 + 3;
  console.log(`${layer}也重试 3 次：一次故障 → ${requests} 个请求`);
}
// 客户端也重试 3 次：一次故障 → 4 个请求
// harness也重试 3 次：一次故障 → 16 个请求
// 调用 agent 的服务也重试 3 次：一次故障 → 64 个请求
