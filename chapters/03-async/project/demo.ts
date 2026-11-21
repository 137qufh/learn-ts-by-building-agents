// 第 3 章项目：用你实现的流式客户端和模型"对话"
//
// 运行：pnpm tsx chapters/03-async/project/demo.ts
//
// 默认连接的是 fake-openai.ts 里的假服务器，不需要网络和 API key。
// 想连接真正的模型，设置环境变量（任何 OpenAI 兼容的接口都可以）：
//
//   OPENAI_API_KEY=sk-...                    必填
//   OPENAI_MODEL=...                         必填，例如 deepseek-chat、qwen-plus、gpt-4.1-mini
//   OPENAI_BASE_URL=https://.../v1           可选，默认 https://api.openai.com/v1
//
// 推荐把它们写在仓库根目录的 .env 文件里（已经在 .gitignore 中，不会被提交），然后：
//
//   pnpm tsx --env-file=.env chapters/03-async/project/demo.ts "你的问题"
//
// 流式输出的过程中按 Ctrl+C 可以取消。
//
// 它调用的是你在 exercises/03-async/project/llm-client.ts 里写的代码。
// 还没实现完时，会打印出是哪个函数还在 TODO。

import {
  createClient,
  type ChatRequest,
  type ClientOptions,
  type LlmClient,
} from "../../../exercises/03-async/project/llm-client.ts";
import { createFakeOpenAI, errorReply, textReply, toolCallReply } from "./fake-openai.ts";

const apiKey = process.env.OPENAI_API_KEY;

// 这两个函数练习 4、6 里也有。这里单独写一份，这样那些练习没做完时，demo 也能正确地报告"还没完成"
function describe(error: unknown): string {
  const parts: string[] = [];
  for (
    let e = error;
    e !== undefined && parts.length < 5;
    e = e instanceof Error ? e.cause : undefined
  ) {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- 非 Error 的值用 String() 兜底
    parts.push(e instanceof Error ? e.message : String(e));
  }
  return parts.join(" ← ");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
const question = process.argv[2] ?? "用三句话介绍 TypeScript。";

function makeClient(): LlmClient | undefined {
  const onRetry: NonNullable<ClientOptions["retry"]>["onRetry"] = ({ attempt, delayMs, error }) => {
    console.log(`[第 ${attempt} 次尝试失败：${describe(error)}，${delayMs}ms 后重试]`);
  };

  if (apiKey !== undefined && apiKey !== "") {
    const model = process.env.OPENAI_MODEL;
    if (model === undefined || model === "") {
      console.log("设置了 OPENAI_API_KEY，还需要设置 OPENAI_MODEL（模型名称）。");
      return undefined;
    }
    const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
    console.log(`── 连接 ${baseUrl}，模型 ${model} ──`);
    return createClient({ baseUrl, apiKey, model, retry: { onRetry } });
  }

  console.log("── 没有设置 OPENAI_API_KEY，使用假服务器（它的回答是写死的） ──");
  const fake = createFakeOpenAI([
    // 第一个请求：服务器过载，告诉我们 1 秒后再试
    errorReply(503, "服务器过载，请稍后再试", { headers: { "Retry-After": "1" } }),
    textReply(
      "TypeScript 是 JavaScript 的超集，给它加上了静态类型。类型在编译时检查，运行前就能发现很多错误。它最终编译成普通的 JavaScript，能在任何地方运行。",
      {
        delayMs: 30,
      },
    ),
    toolCallReply([{ id: "call_1", name: "get_weather", arguments: '{"city":"北京"}' }], {
      text: "我来查一下。",
      delayMs: 30,
    }),
  ]);
  return createClient({
    baseUrl: "https://fake.test/v1",
    apiKey: "fake-key",
    model: "fake-model",
    fetch: fake.fetch,
    retry: { onRetry },
  });
}

/** 流式打印一次回复。按 Ctrl+C 取消，此时返回 false。 */
async function ask(client: LlmClient, request: ChatRequest): Promise<boolean> {
  const controller = new AbortController();
  const onSigint = () => controller.abort(new DOMException("用户按了 Ctrl+C", "AbortError"));
  process.once("SIGINT", onSigint);
  let midLine = false; // 正在输出一行文本，还没换行
  const newline = () => (midLine ? "\n" : "");
  try {
    for await (const event of client.stream(request, { signal: controller.signal })) {
      switch (event.type) {
        case "text":
          process.stdout.write(event.text);
          midLine = true;
          break;
        case "tool_call":
          console.log(
            `${newline()}[模型请求调用工具 ${event.call.name}，参数 ${event.call.arguments}]`,
          );
          midLine = false;
          break;
        case "finish": {
          const usage = event.usage
            ? `，输入 ${event.usage.inputTokens} / 输出 ${event.usage.outputTokens} token`
            : "";
          console.log(`${newline()}[结束：${event.reason}${usage}]`);
          break;
        }
      }
    }
  } catch (error) {
    if (isAbortError(error)) {
      console.log(`${newline()}[已取消]`);
      return false;
    }
    throw error;
  } finally {
    process.off("SIGINT", onSigint);
  }
  return true;
}

try {
  const client = makeClient();
  if (client !== undefined) {
    console.log(`\n> ${question}\n`);
    const finished = await ask(client, { messages: [{ role: "user", content: question }] });
    if (finished) {
      console.log("\n> 北京今天天气怎么样？\n");
      await ask(client, {
        messages: [{ role: "user", content: "北京今天天气怎么样？" }],
        tools: [
          {
            name: "get_weather",
            description: "查询城市今天的天气",
            parameters: {
              type: "object",
              properties: { city: { type: "string", description: "城市名，例如“北京”" } },
              required: ["city"],
              additionalProperties: false,
            },
          },
        ],
      });
    }
  }
} catch (error) {
  const message = describe(error);
  if (message.includes("TODO")) {
    console.log(`还没完成：${message}`);
    console.log("运行 pnpm ex llm-client 查看还有哪些测试没通过。");
  } else {
    console.log(`出错了：${message}`);
    process.exitCode = 1;
  }
}
