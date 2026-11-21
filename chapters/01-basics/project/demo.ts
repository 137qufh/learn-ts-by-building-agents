// 第 1 章项目：用你实现的函数构造、渲染、检查一份聊天记录
//
// 运行：pnpm tsx chapters/01-basics/project/demo.ts
//
// 它调用的是你在 exercises/01-basics/project/transcript.ts 里写的函数。
// 还没实现完时，会打印出是哪个函数还在 TODO。

import {
  assistantMessage,
  countByRole,
  pendingToolCalls,
  renderTranscript,
  systemMessage,
  toolMessage,
  userMessage,
  validateTranscript,
  type Message,
} from "../../../exercises/01-basics/project/transcript.ts";

try {
  // 模拟 agent 循环的几个回合。第 6 章里，assistant 消息会来自真正的模型，tool 消息来自真正的工具。
  const transcript: Message[] = [
    systemMessage("你是一个会用工具的助手。"),
    userMessage("帮我算一下 (3 + 4) × 5，再查查明天上海的天气。"),
  ];

  // 回合 1：模型决定调用两个工具
  transcript.push(
    assistantMessage("好的，我分两步来。", [
      { id: "call_calc", name: "calculator", arguments: { expression: "(3 + 4) * 5" } },
      { id: "call_weather", name: "weather", arguments: { city: "上海", day: "tomorrow" } },
    ]),
  );
  console.log(
    "等待执行的工具：",
    pendingToolCalls(transcript).map((call) => call.name),
  );

  // harness 执行工具，把结果追加进记录
  transcript.push(toolMessage("call_calc", "35"));
  transcript.push(toolMessage("call_weather", "天气服务超时", { isError: true }));
  console.log(
    "等待执行的工具：",
    pendingToolCalls(transcript).map((call) => call.name),
  );

  // 回合 2：模型看到工具结果，给出最终回答
  transcript.push(assistantMessage("(3 + 4) × 5 = 35。天气服务暂时不可用，稍后我可以再试一次。"));

  console.log("\n── 聊天记录 ──");
  console.log(renderTranscript(transcript));
  console.log("\n── 统计 ──");
  console.log(countByRole(transcript));
  console.log("\n── 检查 ──");
  const problems = validateTranscript(transcript);
  console.log(problems.length === 0 ? "没有发现问题 ✓" : problems.join("\n"));
} catch (error) {
  console.log(`还没完成：${error instanceof Error ? error.message : String(error)}`);
  console.log("运行 pnpm ex transcript 查看还有哪些测试没通过。");
}
