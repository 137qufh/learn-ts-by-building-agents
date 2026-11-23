// 第 4 章项目演示：@learn-ts/agent-kit
// 运行：pnpm tsx --conditions=@learn-ts/source chapters/04-tooling/project/demo.ts
//
// 第一部分像 harness 一样使用这个包：注册工具，让（假的）模型调用它，把结果交回给模型。
// 第二部分运行你在 exercises/04-tooling/project/release-check.ts 里写的发布前检查。
//
// --conditions=@learn-ts/source 让 Node 直接加载包的 src/ 源码（4.2 节）；去掉它，
// 加载的就是 dist/ 里的编译产物，需要先运行 pnpm --filter @learn-ts/agent-kit build。

import { join } from "node:path";
import { createClient, createRegistry, defineTool, type Message } from "@learn-ts/agent-kit";
import { createFakeOpenAI, textReply, toolCallReply } from "@learn-ts/agent-kit/testing";
import {
  releaseCheck,
  repoRoot,
  run,
  tscScript,
} from "../../../exercises/04-tooling/project/release-check.ts";

console.log(`@learn-ts/agent-kit 加载自：${import.meta.resolve("@learn-ts/agent-kit")}\n`);

// ── 第一部分：一个完整的工具调用回合 ──────────────────────────────────

const weather = defineTool({
  name: "get_weather",
  description: "查询城市今天的天气",
  parameters: { city: { type: "string", description: "城市名" } },
  execute: ({ city }) => `${city}：晴，25°C`,
});
const registry = createRegistry().register(weather);

const fake = createFakeOpenAI([
  toolCallReply([{ id: "call_1", name: "get_weather", arguments: '{"city":"北京"}' }], {
    text: "我查一下。",
  }),
  textReply("北京今天晴，25°C，适合出门。"),
]);
const client = createClient({
  baseUrl: "https://fake.test/v1",
  apiKey: "fake-key",
  model: "fake-model",
  fetch: fake.fetch,
});

const messages: Message[] = [{ role: "user", content: "北京今天天气怎么样？" }];
console.log(`> ${messages[0]?.content ?? ""}`);
for (let turn = 1; turn <= 3; turn++) {
  const result = await client.complete({ messages, tools: registry.schemas() });
  if (result.text !== "") console.log(`模型：${result.text}`);
  if (result.toolCalls.length === 0) break;

  messages.push({
    role: "assistant",
    content: result.text,
    tool_calls: result.toolCalls.map((call) => ({
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: call.arguments },
    })),
  });
  for (const call of result.toolCalls) {
    const outcome = registry.dispatch(call);
    const content = outcome.ok ? String(outcome.value) : `错误：${outcome.error}`;
    console.log(`[调用 ${call.name}(${call.arguments}) → ${content}]`);
    messages.push({ role: "tool", tool_call_id: call.id, content });
  }
}

// ── 第二部分：发布前检查 ──────────────────────────────────────────────

console.log("\n── 发布前检查 ──");
const packageRoot = join(repoRoot, "packages/agent-kit");
const built = await run(process.execPath, [tscScript, "-p", "tsconfig.build.json"], packageRoot);
if (built.code !== 0) {
  console.log(`构建失败：\n${built.stdout}${built.stderr}`);
  process.exit(1);
}

const usage = `
import { createRegistry, defineTool } from "@learn-ts/agent-kit";
const echo = defineTool({
  name: "echo",
  description: "原样返回",
  parameters: { text: { type: "string" } },
  execute: ({ text }) => text,
});
console.log(createRegistry().register(echo).call("echo", { text: "ok" }));
`;

try {
  const problems = await releaseCheck(packageRoot, usage);
  console.log(
    problems.length === 0
      ? "✓ 没有发现问题，可以发布"
      : problems.map((problem) => `✗ ${problem}`).join("\n"),
  );
} catch (error) {
  console.log(`还没完成：${error instanceof Error ? error.message : String(error)}`);
}
