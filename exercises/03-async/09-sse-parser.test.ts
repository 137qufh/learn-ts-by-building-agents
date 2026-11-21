import { describe, expect, test } from "vitest";
import { decodeChunks, parseSse, readSse, splitLines, type SseEvent } from "./09-sse-parser.ts";

async function drain<T>(source: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of source) {
    items.push(item);
  }
  return items;
}

async function* from<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    await Promise.resolve();
    yield item;
  }
}

const encoder = new TextEncoder();

/** 把文本编码成字节，然后在指定的字节位置切开。 */
function splitBytes(text: string, cuts: number[]): Uint8Array[] {
  const bytes = encoder.encode(text);
  const chunks: Uint8Array[] = [];
  let start = 0;
  for (const cut of [...cuts, bytes.length]) {
    chunks.push(bytes.slice(start, cut));
    start = cut;
  }
  return chunks;
}

/** 依次解析整段 SSE 文本。 */
function parseText(text: string): Promise<SseEvent[]> {
  return drain(parseSse(splitLines(from([text]))));
}

describe("decodeChunks", () => {
  test("普通的 ASCII 文本", async () => {
    expect((await drain(decodeChunks(from(splitBytes("hello world", [5]))))).join("")).toBe(
      "hello world",
    );
  });

  test("汉字的字节被拆到两块里：仍然正确解码", async () => {
    // "你好" 共 6 字节，在第 4 字节处切开，"好" 被拆成了 1 + 2 字节
    const text = (await drain(decodeChunks(from(splitBytes("你好", [4]))))).join("");
    expect(text).toBe("你好");
    expect(text).not.toContain("\uFFFD");
  });

  test("每个字节单独一块也没问题", async () => {
    const text = "流式🚀输出";
    const cuts = Array.from({ length: encoder.encode(text).length - 1 }, (_, i) => i + 1);
    expect((await drain(decodeChunks(from(splitBytes(text, cuts))))).join("")).toBe(text);
  });

  test("不产出空字符串", async () => {
    const chunks = await drain(decodeChunks(from(splitBytes("你", [1, 2]))));
    expect(chunks).toEqual(["你"]);
  });

  test("流结束时还有不完整的字节：输出替换字符，而不是悄悄丢掉", async () => {
    const bytes = encoder.encode("好").slice(0, 2);
    expect((await drain(decodeChunks(from([bytes])))).join("")).toBe("\uFFFD");
  });
});

describe("splitLines", () => {
  test("按 \\n 切分", async () => {
    expect(await drain(splitLines(from(["a\nb\nc\n"])))).toEqual(["a", "b", "c"]);
  });

  test("一行被拆到几块里", async () => {
    expect(await drain(splitLines(from(["da", "ta: 你", "好\nnext\n"])))).toEqual([
      "data: 你好",
      "next",
    ]);
  });

  test("保留空行（SSE 用空行分隔事件）", async () => {
    expect(await drain(splitLines(from(["a\n\nb\n\n"])))).toEqual(["a", "", "b", ""]);
  });

  test("支持 \\r\\n 和单独的 \\r", async () => {
    expect(await drain(splitLines(from(["a\r\nb\rc\n"])))).toEqual(["a", "b", "c"]);
  });

  test("\\r\\n 被拆到两块里：只算一个换行", async () => {
    expect(await drain(splitLines(from(["a\r", "\nb\r\n"])))).toEqual(["a", "b"]);
  });

  test("一块以 \\r 结尾，下一块不是 \\n 开头", async () => {
    expect(await drain(splitLines(from(["a\r", "b\n"])))).toEqual(["a", "b"]);
  });

  test("\\r 结尾，中间夹着空块，再来 \\n：仍然只算一个换行", async () => {
    expect(await drain(splitLines(from(["a\r", "", "\nb\n"])))).toEqual(["a", "b"]);
  });

  test("连续的 \\r\\r\\n：两个换行", async () => {
    expect(await drain(splitLines(from(["a\r", "\r\nb\n"])))).toEqual(["a", "", "b"]);
  });

  test("流结束时没有换行的内容作为最后一行", async () => {
    expect(await drain(splitLines(from(["a\nlast"])))).toEqual(["a", "last"]);
  });

  test("一行都没有", async () => {
    expect(await drain(splitLines(from([])))).toEqual([]);
    expect(await drain(splitLines(from([""])))).toEqual([]);
  });

  test("拿到一行就立刻产出，不等流结束", async () => {
    let released = false;
    async function* slow(): AsyncGenerator<string> {
      yield "first\nsec";
      released = true;
      yield "ond\n";
    }
    for await (const line of splitLines(slow())) {
      expect(line).toBe("first");
      expect(released).toBe(false);
      break;
    }
  });
});

describe("parseSse", () => {
  test("最简单的事件", async () => {
    expect(await parseText("data: hello\n\n")).toEqual([{ event: "message", data: "hello" }]);
  });

  test("多个事件", async () => {
    expect(await parseText("data: 1\n\ndata: 2\n\n")).toEqual([
      { event: "message", data: "1" },
      { event: "message", data: "2" },
    ]);
  });

  test("event 字段设置事件类型，只对当前事件有效", async () => {
    expect(await parseText("event: ping\ndata: x\n\ndata: y\n\n")).toEqual([
      { event: "ping", data: "x" },
      { event: "message", data: "y" },
    ]);
  });

  test("多个 data 行用 \\n 连接", async () => {
    expect(await parseText("data: 第一行\ndata: 第二行\n\n")).toEqual([
      { event: "message", data: "第一行\n第二行" },
    ]);
  });

  test("只去掉冒号后的一个空格", async () => {
    expect(await parseText("data:no-space\n\ndata:  two-spaces\n\n")).toEqual([
      { event: "message", data: "no-space" },
      { event: "message", data: " two-spaces" },
    ]);
  });

  test("值里的冒号保留（只按第一个冒号切分）", async () => {
    expect(await parseText('data: {"a":"b:c"}\n\n')).toEqual([
      { event: "message", data: '{"a":"b:c"}' },
    ]);
  });

  test("注释被忽略", async () => {
    expect(await parseText(": keep-alive\n\n: 又一条注释\ndata: x\n\n")).toEqual([
      { event: "message", data: "x" },
    ]);
  });

  test("没有 data 行的事件不分发", async () => {
    expect(await parseText("event: ping\n\ndata: x\n\n")).toEqual([
      { event: "message", data: "x" },
    ]);
  });

  test("空的 data 行也算 data", async () => {
    expect(await parseText("data:\n\ndata\n\n")).toEqual([
      { event: "message", data: "" },
      { event: "message", data: "" },
    ]);
  });

  test("id 会延续到之后的事件，没有 id 时没有这个属性", async () => {
    const events = await parseText("data: a\n\nid: 1\ndata: b\n\ndata: c\n\nid: 2\ndata: d\n\n");
    expect(events).toEqual([
      { event: "message", data: "a" },
      { event: "message", data: "b", id: "1" },
      { event: "message", data: "c", id: "1" },
      { event: "message", data: "d", id: "2" },
    ]);
    expect("id" in (events[0] ?? {})).toBe(false);
  });

  test("包含 \\0 的 id 被忽略", async () => {
    expect(await parseText("id: 1\ndata: a\n\nid: x\0y\ndata: b\n\n")).toEqual([
      { event: "message", data: "a", id: "1" },
      { event: "message", data: "b", id: "1" },
    ]);
  });

  test("retry 和不认识的字段被忽略", async () => {
    expect(await parseText("retry: 1000\nfoo: bar\ndata: x\n\n")).toEqual([
      { event: "message", data: "x" },
    ]);
  });

  test("流结束时不完整的事件被丢弃", async () => {
    expect(await parseText("data: 完整\n\ndata: 不完整")).toEqual([
      { event: "message", data: "完整" },
    ]);
  });

  test("拿到一个完整事件就立刻产出", async () => {
    let more = false;
    async function* lines(): AsyncGenerator<string> {
      yield "data: 1";
      yield "";
      more = true;
      yield "data: 2";
    }
    for await (const event of parseSse(lines())) {
      expect(event.data).toBe("1");
      expect(more).toBe(false);
      break;
    }
  });
});

describe("readSse", () => {
  function responseOf(chunks: Uint8Array[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }

  test("OpenAI 风格的流：字节在任意位置切开", async () => {
    const text = [
      'data: {"choices":[{"delta":{"content":"你"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":"好"}}]}',
      "",
      "data: [DONE]",
      "",
      "",
    ].join("\r\n");
    const total = encoder.encode(text).length;
    // 每 7 个字节切一刀：汉字和 \r\n 都会被切开
    const cuts = Array.from({ length: Math.floor((total - 1) / 7) }, (_, i) => (i + 1) * 7);
    const events = await drain(readSse(responseOf(splitBytes(text, cuts))));
    expect(events.map((e) => e.data)).toEqual([
      '{"choices":[{"delta":{"content":"你"}}]}',
      '{"choices":[{"delta":{"content":"好"}}]}',
      "[DONE]",
    ]);
  });

  test("Anthropic 风格的流：带 event 字段", async () => {
    const text =
      'event: message_start\ndata: {}\n\nevent: content_block_delta\ndata: {"delta":"hi"}\n\n';
    const events = await drain(readSse(responseOf(splitBytes(text, [10, 40]))));
    expect(events).toEqual([
      { event: "message_start", data: "{}" },
      { event: "content_block_delta", data: '{"delta":"hi"}' },
    ]);
  });

  test("可以直接读真正的 fetch 响应（这里用 Response 模拟）", async () => {
    const response = new Response("data: ok\n\n");
    expect(await drain(readSse(response))).toEqual([{ event: "message", data: "ok" }]);
  });

  test("没有 body 时调用就立刻抛出", () => {
    const response = new Response(null, { status: 204 });
    expect(() => readSse(response)).toThrow("body");
  });
});
