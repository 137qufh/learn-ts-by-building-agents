// 第 6 章项目演示：一个只能在工作目录里活动的文件助手
//
// 运行：pnpm tsx --conditions=@learn-ts/source chapters/06-harness/project/demo.ts
//
// 默认用按脚本回复的假模型，不需要网络和 API key，每次运行的结果都一样。
// 想连接真正的模型，设置和第 3 章一样的环境变量（任何 OpenAI 兼容的接口都可以）：
//
//   OPENAI_API_KEY=sk-...           必填
//   OPENAI_MODEL=...                必填，需要支持工具调用，例如 deepseek-chat、qwen-plus、gpt-4.1-mini
//   OPENAI_BASE_URL=https://.../v1  可选，默认 https://api.openai.com/v1
//
//   pnpm tsx --env-file=.env --conditions=@learn-ts/source chapters/06-harness/project/demo.ts "你的问题"
//
// 连接真正的模型时，回答完会等你输入下一个问题（接着同一段对话），直接回车退出。
// 写文件之前会问你同不同意。运行中按 Ctrl+C 取消这一轮。
//
// 工作目录是一个临时目录，里面有一个小小的示例项目，演示结束后删除（设置 KEEP_SANDBOX=1 保留）。
// 文件工具来自你在 exercises/06-harness/project/sandbox.ts 里写的 createFileTools；
// harness 用的是 @learn-ts/agent-kit 里的参考实现。想换成你自己写的，把下面的导入改成
// "../../../exercises/06-harness/project/agent.ts"（接口完全一样）。

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  createAgent,
  createClient,
  createRecordingTracer,
  dispatchEvent,
  requireApproval,
  type AgentResult,
  type Message,
  type Model,
} from "@learn-ts/agent-kit";
import { createScriptedModel, type ScriptStep } from "@learn-ts/agent-kit/testing";
import { createToolbox } from "@learn-ts/agent-kit/zod";
import { createFileTools } from "../../../exercises/06-harness/project/sandbox.ts";

// ── 工作目录：一个小小的示例项目 ────────────────────────────────────

const root = mkdtempSync(join(tmpdir(), "learn-ts-agent-"));
const files: Record<string, string> = {
  "README.md": "# 购物车\n\n一个计算购物车总价的小模块。\n\nTODO: 写使用说明\n",
  "package.json": '{ "name": "cart", "type": "module" }\n',
  "src/cart.ts": [
    "export interface Item {",
    "  name: string;",
    "  price: number; // 单价，单位是分",
    "  quantity: number;",
    "}",
    "",
    "export function total(items: Item[]): number {",
    "  // TODO: 数量为负数时应该报错",
    "  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);",
    "}",
    "",
  ].join("\n"),
  "src/format.ts": [
    'import { total, type Item } from "./cart.ts";',
    "",
    "export function formatTotal(items: Item[]): string {",
    "  // TODO: 支持其他货币",
    "  return `¥${(total(items) / 100).toFixed(2)}`;",
    "}",
    "",
  ].join("\n"),
};
for (const [path, content] of Object.entries(files)) {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), content);
}
// 工作目录外面放一个"秘密"文件：模型想读它时，沙箱会拒绝
writeFileSync(join(root, "..", "learn-ts-agent-secret.txt"), "API_KEY=sk-不应该被读到\n");

// ── 模型：真正的模型，或者按脚本回复的假模型 ──────────────────────────

const apiKey = process.env.OPENAI_API_KEY ?? "";
const modelName = process.env.OPENAI_MODEL ?? "";
const live = apiKey !== "" && modelName !== "";
const defaultQuestion = "看看这个项目里有哪些 TODO，整理成一个清单写进 notes/TODO.md。";
const firstQuestion = process.argv[2] ?? defaultQuestion;

const usage = (inputTokens: number, outputTokens: number) => ({ inputTokens, outputTokens });
const script: ScriptStep[] = [
  {
    text: "我先看看项目的结构，同时搜一下 TODO。",
    toolCalls: [
      { name: "list_files", arguments: { path: "." } },
      { name: "search", arguments: { query: "TODO" } },
    ],
    usage: usage(612, 58),
  },
  {
    // 模型想看看上一级目录：沙箱拒绝，错误信息交还给模型
    text: "上一级目录里可能还有配置，我也看一眼。",
    toolCalls: [{ name: "read_file", arguments: { path: "../learn-ts-agent-secret.txt" } }],
    usage: usage(803, 41),
  },
  {
    text: "那个文件在工作目录之外，我不能读，只看项目本身。再看一下 cart.ts 的上下文。",
    toolCalls: [
      { name: "read_file", arguments: { path: "src/cart.ts", startLine: 7, maxLines: 4 } },
    ],
    usage: usage(901, 47),
  },
  {
    text: "",
    toolCalls: [
      {
        name: "write_file",
        arguments: {
          path: "notes/TODO.md",
          content: [
            "# TODO",
            "",
            "- [ ] README.md：写使用说明",
            "- [ ] src/cart.ts `total`：数量为负数时应该报错",
            "- [ ] src/format.ts `formatTotal`：支持其他货币",
            "",
          ].join("\n"),
        },
      },
    ],
    usage: usage(1040, 96),
  },
  {
    text: [
      "整理好了，一共 3 个 TODO，已经写进 notes/TODO.md：",
      "",
      "1. README.md：写使用说明",
      "2. src/cart.ts 的 total：数量为负数时应该报错（现在会算出负的总价）",
      "3. src/format.ts 的 formatTotal：支持其他货币",
      "",
      "建议先处理第 2 个，它是一个真正的 bug。",
    ].join("\n"),
    usage: usage(1171, 88),
  },
];

const model: Model = live
  ? createClient({
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      apiKey,
      model: modelName,
    })
  : createScriptedModel(script, { delayMs: 12 });

// ── 组装 agent ─────────────────────────────────────────────────────

const terminal = process.stdin.isTTY
  ? createInterface({ input: process.stdin, output: process.stdout })
  : undefined;

async function approve(path: string, signal: AbortSignal): Promise<boolean> {
  if (!live || terminal === undefined) {
    print(`  ？ 允许写入 ${path} 吗？（演示：自动同意）`);
    return true;
  }
  print("");
  // 这次调用超时或者被取消时，signal 会收起这个提问
  const answer = await terminal.question(`  ？ 允许写入 ${path} 吗？(y/N) `, { signal });
  return answer.trim().toLowerCase() === "y";
}

const tracer = createRecordingTracer();
const agent = createAgent({
  model,
  tools: createToolbox(createFileTools(root, { allowWrite: true })),
  system: [
    "你是一个帮用户查看和整理代码的助手。你只能通过工具访问一个工作目录，路径都相对于这个目录。",
    "先用工具了解情况再回答，不要猜文件的内容。用中文回答，简洁。",
  ].join("\n"),
  maxSteps: 12,
  // 工具的超时包括等用户确认的时间（确认是在 wrapToolCall 里发生的），交互时要留够
  toolTimeoutMs: live ? 300_000 : 10_000,
  contextTokens: 8_000,
  middleware: [
    requireApproval(["write_file"], (call, signal) => {
      const { path } = JSON.parse(call.arguments) as { path?: unknown };
      return approve(String(path), signal);
    }),
  ],
  tracer,
});

// ── 运行：把事件显示在终端里 ──────────────────────────────────────

/** 只显示第一行的前 60 个字符 */
const preview = (text: string): string => {
  const line = text.split("\n")[0] ?? "";
  return text.includes("\n") || line.length > 60 ? `${line.slice(0, 60)}…` : line;
};

// 模型的文字是一段段 write 出来的，没有换行；在它后面打印别的内容之前，先换一行
let midLine = false;
function print(line: string): void {
  if (midLine) process.stdout.write("\n");
  midLine = false;
  console.log(line);
}

async function ask(question: string, history: readonly Message[]): Promise<AgentResult> {
  print(`\n> ${question}\n`);
  const controller = new AbortController();
  const onSigint = (): void => controller.abort();
  // 终端交给 readline 时，Ctrl+C 由 readline 接收，不会变成进程的 SIGINT 信号，两边都要监听
  process.once("SIGINT", onSigint);
  terminal?.once("SIGINT", onSigint);

  const run = agent.run(question, { history, signal: controller.signal });
  for await (const event of run) {
    dispatchEvent(event, {
      step_start: () => midLine && print(""),
      text: (e) => {
        process.stdout.write(e.text);
        midLine = !e.text.endsWith("\n");
      },
      tool_call: (e) => print(`  → ${e.call.name}(${preview(e.call.arguments)})`),
      tool_result: ({ result }) =>
        print(
          `  ${result.ok ? "✓" : "✗"} ${result.name} ${Math.round(result.durationMs)}ms：${preview(result.content)}`,
        ),
      step_retry: (e) => print(`  （模型的输出中断了：${e.error.message}，重新生成这一步）`),
      context_trimmed: (e) => print(`  （省略了 ${e.dropped} 条较早的消息，约 ${e.tokens} token）`),
    });
  }
  process.removeListener("SIGINT", onSigint);
  terminal?.removeListener("SIGINT", onSigint);

  const result = await run.result;
  const { stopReason } = result;
  const detail = stopReason.type === "error" ? `（${stopReason.error.message}）` : "";
  print(
    `\n── 结束：${stopReason.type}${detail}，${result.steps} 步，` +
      `输入 ${result.usage.inputTokens} / 输出 ${result.usage.outputTokens} token ──`,
  );
  return result;
}

console.log(
  live
    ? `── 连接 ${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}，模型 ${modelName} ──`
    : "── 没有设置 OPENAI_API_KEY 和 OPENAI_MODEL，使用按脚本回复的假模型 ──",
);
console.log(`工作目录：${root}`);

try {
  let result = await ask(firstQuestion, []);
  // 连接真正的模型时可以接着聊：上一轮的完整记录就是下一轮的 history
  while (live && terminal !== undefined) {
    const next = (await terminal.question("\n> ")).trim();
    if (next === "") break;
    result = await ask(next, result.messages);
  }
  print("\n── 追踪 ──");
  print(tracer.tree());
} finally {
  terminal?.close();
  if (process.env.KEEP_SANDBOX === "1") {
    console.log(`\n工作目录保留在 ${root}`);
  } else {
    rmSync(root, { recursive: true, force: true });
  }
  rmSync(join(root, "..", "learn-ts-agent-secret.txt"), { force: true });
}
