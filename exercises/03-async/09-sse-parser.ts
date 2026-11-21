/**
 * 练习 3-9：SSE 解析器
 *
 * 课程：chapters/03-async/09-streams-and-sse.md
 * 运行：pnpm ex 09-sse-parser
 *
 * 把一个 HTTP 响应体（字节流）一步步变成 SSE 事件：
 *   字节 --decodeChunks--> 文本块 --splitLines--> 行 --parseSse--> 事件
 * 每一步都是一个异步生成器，readSse 把它们串起来。章末项目会直接使用 readSse。
 */
import { todo } from "../todo.ts";

/**
 * 把字节块解码成文本块（UTF-8）。
 * - 一个字符的字节可能被拆到相邻的两块里，要正确拼起来（TextDecoder 的 stream 选项）
 * - 流结束时，别忘了处理解码器里剩下的字节
 * - 不产出空字符串
 */
export async function* decodeChunks(source: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  yield todo("实现 decodeChunks");
}

/**
 * 把文本块切成行（产出的行不包含换行符）。
 * - 换行可以是 \n、\r\n 或者单独的 \r，三种都要支持（SSE 规范如此）
 * - 一行可能被拆到好几块里
 * - \r\n 也可能被拆开：一块以 \r 结尾，下一块以 \n 开头，这仍然只是 **一个** 换行
 * - 流结束时，如果还有没遇到换行的内容，作为最后一行产出
 */
export async function* splitLines(source: AsyncIterable<string>): AsyncGenerator<string> {
  yield todo("实现 splitLines");
}

/** 一个 SSE 事件。 */
export interface SseEvent {
  /** 事件类型，没有 event 字段时是 "message"。 */
  event: string;
  /** 数据，多个 data 行用 "\n" 连接。 */
  data: string;
  /** 最近一次出现的 id 字段的值；从来没有出现过 id 时，没有这个属性。 */
  id?: string;
}

/**
 * 把行解析成 SSE 事件。规则（摘自 HTML 规范，略有简化）：
 *
 * 1. 空行：分发当前的事件，然后清空 event 和 data，准备下一个事件。
 *    如果当前事件一个 data 行也没有，不分发（只清空）
 * 2. 以 ":" 开头的行是注释，忽略
 * 3. 其他行按第一个 ":" 分成字段名和值；值开头如果有一个空格，去掉这 **一个** 空格。
 *    没有 ":" 的行，整行是字段名，值是空字符串
 * 4. 字段 event：设置事件类型
 *    字段 data：追加一行数据（值可以是空字符串，"data:" 也算一个 data 行）
 *    字段 id：记下来，之后分发的 **所有** 事件都带上这个 id，直到出现新的 id（值里有 "\0" 时忽略这一行）
 *    其他字段（包括 retry）：忽略
 * 5. 流结束时，还没遇到空行的事件不完整，丢弃
 */
export async function* parseSse(lines: AsyncIterable<string>): AsyncGenerator<SseEvent> {
  yield todo("实现 parseSse");
}

/**
 * 读取一个响应的事件流：把上面三步串起来。
 * response.body 为 null 时 **调用时立刻** 抛出 Error，消息里包含 "body"
 * （所以它不是生成器函数，而是一个返回生成器的普通函数）。
 */
export function readSse(response: Response): AsyncGenerator<SseEvent> {
  return todo("实现 readSse");
}
