// 6.1 agent 主循环
// 运行：pnpm tsx chapters/06-harness/examples/01-agent-loop.ts
//
// 这个示例不依赖任何包：模型是一个手写的"假模型"，它看聊天记录决定下一步做什么。
// 真正的模型也是一样，只不过决定是由神经网络做出的。

type ToolCall = { id: string; name: string; arguments: string };
type Message =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: { id: string; function: { name: string; arguments: string } }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };
type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "finish"; reason: string };

// ── 1. 一个看聊天记录做决定的假模型 ──────────────────────────────
// 还没有工具结果：请求计算两个加法；已经有结果了：用结果回答
async function* fakeModel(messages: readonly Message[]): AsyncGenerator<StreamEvent> {
  const results = messages.filter((m) => m.role === "tool");
  if (results.length === 0) {
    yield { type: "text", text: "我来算一下。" };
    yield { type: "tool_call", call: { id: "c1", name: "add", arguments: '{"a":1,"b":2}' } };
    yield { type: "tool_call", call: { id: "c2", name: "add", arguments: '{"a":3,"b":4}' } };
    yield { type: "finish", reason: "tool_calls" };
    return;
  }
  yield { type: "text", text: `1+2=${results[0]?.content}，3+4=${results[1]?.content}。` };
  yield { type: "finish", reason: "stop" };
}

// ── 2. 工具 ────────────────────────────────────────────────────────
function add(rawArguments: string): string {
  const { a, b } = JSON.parse(rawArguments) as { a: number; b: number };
  return String(a + b);
}

// ── 3. 主循环 ──────────────────────────────────────────────────────
const messages: Message[] = [{ role: "user", content: "1+2 和 3+4 各是多少？" }];
const maxSteps = 5;

for (let step = 1; step <= maxSteps; step++) {
  // 收集一个回合
  let text = "";
  const toolCalls: ToolCall[] = [];
  for await (const event of fakeModel([...messages])) {
    if (event.type === "text") text += event.text;
    if (event.type === "tool_call") toolCalls.push(event.call);
  }
  console.log(`第 ${step} 步：模型说"${text}"，请求了 ${toolCalls.length} 个工具调用`);

  // 追加 assistant 消息：工具调用原样放回去
  messages.push(
    toolCalls.length === 0
      ? { role: "assistant", content: text }
      : {
          role: "assistant",
          content: text === "" ? null : text,
          tool_calls: toolCalls.map((c) => ({
            id: c.id,
            function: { name: c.name, arguments: c.arguments },
          })),
        },
  );
  if (toolCalls.length === 0) {
    console.log(`完成，最终回答：${text}`);
    break;
  }

  // 执行工具，每个结果一条 tool 消息
  for (const call of toolCalls) {
    const content = add(call.arguments);
    console.log(`  执行 ${call.name}(${call.arguments}) → ${content}`);
    messages.push({ role: "tool", tool_call_id: call.id, content });
  }
}
// 第 1 步：模型说"我来算一下。"，请求了 2 个工具调用
//   执行 add({"a":1,"b":2}) → 3
//   执行 add({"a":3,"b":4}) → 7
// 第 2 步：模型说"1+2=3，3+4=7。"，请求了 0 个工具调用
// 完成，最终回答：1+2=3，3+4=7。

console.log(`\n聊天记录一共 ${messages.length} 条：${messages.map((m) => m.role).join(" → ")}`);
// 聊天记录一共 5 条：user → assistant → tool → tool → assistant

// ── 4. 为什么请求要发副本 ──────────────────────────────────────────
const saved: (readonly Message[])[] = [];
const history: Message[] = [{ role: "user", content: "hi" }];
saved.push(history); //     保存引用
saved.push([...history]); // 保存副本
history.push({ role: "assistant", content: "你好" });
console.log(`\n保存引用的那份现在有 ${saved[0]?.length} 条，副本还是 ${saved[1]?.length} 条`);
// 保存引用的那份现在有 2 条，副本还是 1 条
