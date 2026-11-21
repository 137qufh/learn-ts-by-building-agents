// 3.9 流与 SSE：解析流式响应
// 运行：pnpm tsx chapters/03-async/examples/09-streams-and-sse.ts

import { createServer } from "node:http";

const encoder = new TextEncoder();

/** 把几段字节做成一个 ReadableStream，模拟网络上分批到达的数据。 */
function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

// ── 1. 响应体是一个字节流 ────────────────────────────────────────────
const response = new Response(streamOf([encoder.encode("第一块，"), encoder.encode("第二块")]));
const body = response.body; // ReadableStream<Uint8Array> | null
if (body === null) {
  throw new Error("没有响应体");
}

// 底层的读法：拿一个 reader，反复 read()，直到 done
const reader = body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) {
    break;
  }
  console.log("收到", value.length, "字节"); // 收到 12 字节 / 收到 9 字节
}
reader.releaseLock();

// 更简单的读法：ReadableStream 是异步可迭代对象
const again = new Response(streamOf([encoder.encode("ab"), encoder.encode("cd")]));
for await (const chunk of again.body ?? []) {
  console.log(chunk); // Uint8Array(2) [ 97, 98 ] / Uint8Array(2) [ 99, 100 ]
}

// ── 2. 字节 → 文本：一个汉字可能被拆到两块里 ─────────────────────────
const bytes = encoder.encode("你好"); // UTF-8 下每个汉字 3 个字节，共 6 个
const parts = [bytes.slice(0, 4), bytes.slice(4)]; // 在"好"的中间切开

const naive = parts.map((part) => new TextDecoder().decode(part)).join("");
console.log("逐块解码：", naive); // 逐块解码： 你���
console.log(naive.includes("\uFFFD")); // true：无法解码的字节变成了替换字符 U+FFFD

const decoder = new TextDecoder();
let text = "";
for (const part of parts) {
  text += decoder.decode(part, { stream: true }); // stream: true：不完整的字节先留着，等下一块
}
text += decoder.decode(); // 流结束：把剩下的字节也处理掉
console.log("流式解码：", text); // 流式解码： 你好

// ── 3. 文本 → 行：一行也可能被拆到两块里 ─────────────────────────────
const textChunks = ["data: 你", "好\n\nda", "ta: 世界\n", "\n"];

console.log(textChunks.flatMap((chunk) => chunk.split("\n")));
// [ 'data: 你', '好', '', 'da', 'ta: 世界', '', '', '' ]：行被切坏了

function* splitLines(chunks: Iterable<string>): Generator<string> {
  let buffer = "";
  for (const chunk of chunks) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // 最后一段可能不完整，留到下一块
    yield* lines; // yield*：把另一个可迭代对象的值逐个 yield 出去
  }
  if (buffer !== "") {
    yield buffer;
  }
}
console.log([...splitLines(textChunks)]);
// [ 'data: 你好', '', 'data: 世界', '' ]

// ── 4. SSE 的格式 ───────────────────────────────────────────────────
const sse = [
  ": 冒号开头的是注释，用来保持连接",
  "event: greeting",
  "data: 第一行",
  "data: 第二行",
  "",
  "data: 没有 event 字段时，事件类型是 message",
  "",
].join("\n");
console.log(sse);

// ── 5. OpenAI 兼容接口的流式响应 ─────────────────────────────────────
// 每个事件的 data 是一个 JSON，最后用 [DONE] 表示结束
const openaiChunks = [
  'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":""}}]}\n\n',
  'data: {"choices":[{"index":0,"delta":{"content":"你"}}]}\n\ndata: {"choices":[{"in',
  'dex":0,"delta":{"content":"好"}}]}\n\n',
  'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
  "data: [DONE]\n\n",
];

interface ChunkJson {
  choices: { index: number; delta: { content?: string }; finish_reason?: string | null }[];
}

let reply = "";
for (const line of splitLines(openaiChunks)) {
  if (!line.startsWith("data: ")) {
    continue; // 空行（事件分隔）和其他字段，这个简化版本都跳过
  }
  const data = line.slice("data: ".length);
  if (data === "[DONE]") {
    break;
  }
  const chunk = JSON.parse(data) as ChunkJson; // 3.4 节说过：as 只是断言，第 5 章会做真正的校验
  reply += chunk.choices[0]?.delta.content ?? "";
}
console.log("拼出的回复：", reply); // 拼出的回复： 你好

// ── 6. 真实的 HTTP 流：数据到一块，读一块 ────────────────────────────
const server = createServer((_request, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const words = ["流", "式", "输", "出"];
  let i = 0;
  const timer = setInterval(() => {
    const word = words[i++];
    if (word === undefined) {
      clearInterval(timer);
      res.end("data: [DONE]\n\n");
      return;
    }
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: word } }] })}\n\n`);
  }, 30);
  res.on("close", () => clearInterval(timer));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const url =
  typeof address === "object" && address !== null ? `http://127.0.0.1:${address.port}/` : "";

const live = await fetch(url);
console.log("Content-Type：", live.headers.get("content-type")); // Content-Type： text/event-stream
// pipeThrough(new TextDecoderStream())：把字节流变成文本流，内部做的就是第 2 部分的 stream: true
const textStream = live.body?.pipeThrough(new TextDecoderStream()) ?? [];
let received = 0;
for await (const chunk of textStream) {
  received++; // 每 30ms 到一块；在这里就可以立刻把 chunk 显示出来，不用等整个响应结束
  void chunk;
}
// 数据是分好几次到达的，而不是最后一次性到达（具体几次取决于网络，这里通常是 5 次）
console.log("分批到达：", received >= 3); // 分批到达： true
server.close();
