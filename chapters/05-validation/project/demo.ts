// 第 5 章项目演示：用 Zod 定义工具
// 运行：pnpm tsx --conditions=@learn-ts/source chapters/05-validation/project/demo.ts
//
// 用你在 exercises/05-validation/project/toolbox.ts 里写的工具箱，和一个（假的）模型走完几个回合：
// 模型第一次传错了参数，看到错误信息后自己改正，最后给出回答。
// 做完练习之前，运行它会在第一个没实现的地方停下来。

import { createClient, type Message } from "@learn-ts/agent-kit";
import { createFakeOpenAI, textReply, toolCallReply } from "@learn-ts/agent-kit/testing";
import { z } from "zod";
import { createToolbox, defineTool } from "../../../exercises/05-validation/project/toolbox.ts";

const files = new Map([
  [
    "src/agent.ts",
    'import { createClient } from "@learn-ts/agent-kit";\n\nexport async function run() {}\n',
  ],
  ["README.md", "# 我的 agent\n"],
]);

try {
  const readFile = defineTool({
    name: "read_file",
    description: "读取工作目录里的一个文本文件",
    parameters: z.object({
      path: z.string().min(1, "path 不能为空").describe("相对于工作目录的路径，例如 src/agent.ts"),
      maxLines: z.number().int().min(1).max(500).default(100).describe("最多读取多少行"),
    }),
    execute: ({ path, maxLines }) => {
      const text = files.get(path);
      if (text === undefined) {
        throw new Error(`文件不存在：${path}。存在的文件：${[...files.keys()].join(", ")}`);
      }
      return text.split("\n").slice(0, maxLines).join("\n");
    },
  });

  const tools = createToolbox([readFile]);
  console.log("给模型的工具描述：");
  console.log(JSON.stringify(tools.schemas()[0], null, 2));

  const fake = createFakeOpenAI([
    toolCallReply([{ id: "call_1", name: "read_file", arguments: '{"path":"","maxLines":"10"}' }]),
    toolCallReply([{ id: "call_2", name: "read_file", arguments: '{"path":"agent.ts"}' }]),
    toolCallReply([
      { id: "call_3", name: "read_file", arguments: '{"path":"src/agent.ts","maxLines":3}' },
    ]),
    textReply(
      "src/agent.ts 从 @learn-ts/agent-kit 导入了 createClient，并导出了一个空的 run 函数。",
    ),
  ]);
  const client = createClient({
    baseUrl: "https://fake.test/v1",
    apiKey: "k",
    model: "m",
    fetch: fake.fetch,
  });

  const messages: Message[] = [{ role: "user", content: "src/agent.ts 里写了什么？" }];
  console.log(`\n> ${messages[0]?.content ?? ""}`);
  for (let turn = 1; turn <= 5; turn++) {
    const result = await client.complete({ messages, tools: tools.schemas() });
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
      const outcome = await tools.dispatch(call);
      const mark = outcome.ok ? "✓" : "✗";
      console.log(
        `[${mark} ${call.name}(${call.arguments})]\n${outcome.content.replace(/^/gm, "    ")}`,
      );
      messages.push({ role: "tool", tool_call_id: call.id, content: outcome.content });
    }
  }
} catch (error) {
  console.log(`还没完成：${error instanceof Error ? error.message : String(error)}`);
}
