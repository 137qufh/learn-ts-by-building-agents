/**
 * 练习 3-9 参考答案：SSE 解析器
 */

export async function* decodeChunks(source: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  for await (const chunk of source) {
    const text = decoder.decode(chunk, { stream: true });
    if (text !== "") {
      yield text;
    }
  }
  const rest = decoder.decode(); // 不带参数调用：流结束，处理剩下的字节
  if (rest !== "") {
    yield rest;
  }
}

export async function* splitLines(source: AsyncIterable<string>): AsyncGenerator<string> {
  let buffer = "";
  // 上一块以 \r 结尾：它可能是 \r\n 的前一半，下一块开头的 \n 要跳过
  let skipLeadingNewline = false;
  for await (const chunk of source) {
    if (chunk === "") {
      continue; // 空块什么也不改变（特别是不能清掉 skipLeadingNewline）
    }
    let text = chunk;
    if (skipLeadingNewline && text.startsWith("\n")) {
      text = text.slice(1);
    }
    skipLeadingNewline = false;
    buffer += text;

    let start = 0;
    for (let i = 0; i < buffer.length; i++) {
      const char = buffer[i];
      if (char !== "\n" && char !== "\r") {
        continue;
      }
      yield buffer.slice(start, i);
      if (char === "\r") {
        if (i + 1 === buffer.length) {
          skipLeadingNewline = true; // \r 在这一块的末尾，还不知道后面是不是 \n
        } else if (buffer[i + 1] === "\n") {
          i++; // \r\n 算一个换行
        }
      }
      start = i + 1;
    }
    buffer = buffer.slice(start);
  }
  if (buffer !== "") {
    yield buffer;
  }
}

export interface SseEvent {
  event: string;
  data: string;
  id?: string;
}

export async function* parseSse(lines: AsyncIterable<string>): AsyncGenerator<SseEvent> {
  let eventType = "";
  let dataLines: string[] = [];
  let hasData = false;
  let lastId: string | undefined;

  for await (const line of lines) {
    if (line === "") {
      // 空行：分发事件
      if (hasData) {
        const event: SseEvent = { event: eventType || "message", data: dataLines.join("\n") };
        if (lastId !== undefined) {
          event.id = lastId;
        }
        yield event;
      }
      eventType = "";
      dataLines = [];
      hasData = false;
      continue;
    }
    if (line.startsWith(":")) {
      continue; // 注释
    }

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1); // 只去掉一个空格
    }

    switch (field) {
      case "event":
        eventType = value;
        break;
      case "data":
        dataLines.push(value);
        hasData = true;
        break;
      case "id":
        if (!value.includes("\0")) {
          lastId = value;
        }
        break;
      default:
        break; // retry 和不认识的字段：忽略
    }
  }
  // 流结束时还没遇到空行的事件不完整，丢弃
}

export function readSse(response: Response): AsyncGenerator<SseEvent> {
  const body = response.body;
  if (body === null) {
    throw new Error("响应没有 body，无法读取事件流");
  }
  return parseSse(splitLines(decodeChunks(body)));
}
