// 6.2 脚本化的假模型：确定性测试
// 运行：pnpm tsx chapters/06-harness/examples/02-scripted-model.ts
//
// 一个极简的假模型，以及用它"测试"一个小循环：每次运行的结果都完全一样。

import assert from "node:assert/strict";

type Message = { role: string; content: string | null; tool_call_id?: string };
type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; call: { id: string; name: string; arguments: string } }
  | { type: "finish"; reason: string };
type Reply =
  | { text?: string; toolCalls?: { name: string; arguments?: object }[] }
  | { fail: Error; afterText?: string };

// ── 1. 假模型：每次 stream 消费脚本的一步 ──────────────────────────
function createScriptedModel(script: Reply[]) {
  const requests: Message[][] = [];
  let next = 0;
  let callCount = 0;
  return {
    requests,
    async *stream(messages: Message[], signal?: AbortSignal): AsyncGenerator<StreamEvent> {
      signal?.throwIfAborted();
      const step = script[next++];
      if (step === undefined) throw new Error(`脚本已经用完：模型被调用了第 ${next} 次`);
      requests.push(structuredClone(messages)); // 深拷贝：调用方之后的修改不会影响记录

      const text = "fail" in step ? (step.afterText ?? "") : (step.text ?? "");
      const chars = Array.from(text);
      for (let i = 0; i < chars.length; i += 4)
        yield { type: "text", text: chars.slice(i, i + 4).join("") };
      if ("fail" in step) throw step.fail;

      for (const call of step.toolCalls ?? []) {
        callCount++; // 整个脚本里唯一的 id
        yield {
          type: "tool_call",
          call: {
            id: `call_${callCount}`,
            name: call.name,
            arguments: JSON.stringify(call.arguments ?? {}),
          },
        };
      }
      yield { type: "finish", reason: (step.toolCalls ?? []).length > 0 ? "tool_calls" : "stop" };
    },
  };
}

// ── 2. 被测试的代码：一个带"出错重试一次"的小循环 ─────────────────────
async function runOnce(
  model: ReturnType<typeof createScriptedModel>,
  question: string,
): Promise<Message[]> {
  const messages: Message[] = [{ role: "user", content: question }];
  for (let step = 1; step <= 5; step++) {
    let text = "";
    const calls: { id: string; name: string }[] = [];
    try {
      for await (const event of model.stream([...messages])) {
        if (event.type === "text") text += event.text;
        if (event.type === "tool_call") calls.push(event.call);
      }
    } catch {
      step--; // 流中途出错：这一步重来（真正的 harness 会限制重试次数，6.5 节）
      continue;
    }
    messages.push({ role: "assistant", content: text === "" ? null : text });
    if (calls.length === 0) break;
    for (const call of calls)
      messages.push({ role: "tool", tool_call_id: call.id, content: `${call.name} 的结果` });
  }
  return messages;
}

// ── 3. "测试"：精确地制造出流到一半断开的情况 ─────────────────────────
const model = createScriptedModel([
  { text: "我查一下", toolCalls: [{ name: "search", arguments: { q: "ts" } }] },
  { fail: new Error("连接断开"), afterText: "根据搜索" }, // 第二次调用：说了半句就断了
  { text: "根据搜索结果，TypeScript 是……" }, //             重试
]);
const messages = await runOnce(model, "什么是 TypeScript？");

assert.equal(model.requests.length, 3);
assert.equal(model.requests[0]?.length, 1); //   第一次请求只有用户的问题
assert.equal(model.requests[1]?.length, 3); //   第二次带上了工具的结果
assert.deepEqual(model.requests[2], model.requests[1]); // 重试发的是同样的请求
assert.equal(messages.at(-1)?.content, "根据搜索结果，TypeScript 是……"); // 半截的"根据搜索"没有留下
console.log("全部断言通过：");
console.log(messages.map((m) => `  ${m.role}: ${m.content ?? "（只调用工具）"}`).join("\n"));
//   user: 什么是 TypeScript？
//   assistant: 我查一下
//   tool: search 的结果
//   assistant: 根据搜索结果，TypeScript 是……

// ── 4. 取消：假模型也要像真的一样立刻停下 ────────────────────────────
const controller = new AbortController();
controller.abort(new Error("用户取消了"));
try {
  for await (const event of createScriptedModel([{ text: "不会出现" }]).stream(
    [],
    controller.signal,
  ))
    console.log(event);
} catch (error) {
  console.log(`\n取消：${(error as Error).message}`); // 取消：用户取消了
}
