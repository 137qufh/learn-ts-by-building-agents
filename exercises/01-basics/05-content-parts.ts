/**
 * 练习 1-5：消息内容块
 *
 * 课程：chapters/01-basics/06-unions-and-narrowing.md
 * 运行：pnpm ex 05-content-parts
 *
 * 现代的模型 API 里，一条消息的内容既可以是一个简单的字符串，也可以是由多个
 * "内容块"组成的数组：文字、图片、工具执行结果……这道题用可辨识联合来建模它们。
 */
import { todo } from "../todo.ts";

export interface TextPart {
  type: "text";
  text: string;
}

export interface ImagePart {
  type: "image";
  url: string;
  /** 图片的文字描述 */
  alt?: string;
}

export interface ToolResultPart {
  type: "tool_result";
  toolCallId: string;
  output: string;
  /** 工具执行失败时为 true */
  isError?: boolean;
}

export type ContentPart = TextPart | ImagePart | ToolResultPart;

/** 消息内容：一个字符串，或者一组内容块。 */
export type MessageContent = string | readonly ContentPart[];

/**
 * 把一个内容块转换成纯文本：
 *
 * - text        → 原文
 * - image       → "[图片: <alt>]"（alt 去掉首尾空白）；alt 不存在、为空或只有空白时用 url："[图片: <url>]"
 * - tool_result → "[工具结果 #<toolCallId>] <output>"；isError 为 true 时是 "[工具错误 #<toolCallId>] <output>"
 *
 * 要求：用 switch + 穷尽性检查（assertNever）实现。测试检查不到这一点，但这是本题的重点：
 * 实现之后，试着给 ContentPart 加一个新成员，看看编译器会不会提醒你。
 */
export function partToText(part: ContentPart): string {
  return todo("实现 partToText");
}

/**
 * 把整条消息内容转换成纯文本：
 * - 字符串原样返回
 * - 数组：每个块用 partToText 转换后，用换行符 "\n" 连接
 * - undefined（消息没有内容）返回空字符串
 */
export function contentToText(content: MessageContent | undefined): string {
  return todo("实现 contentToText");
}

/** 类型守卫：判断一个内容块是不是文本块。 */
export function isTextPart(part: ContentPart): part is TextPart {
  return todo("实现 isTextPart");
}

/**
 * 只提取文字内容（模型"说的话"），忽略图片和工具结果：
 * - 字符串原样返回
 * - 数组：所有文本块的 text 用 "\n" 连接；没有文本块时返回空字符串
 */
export function extractText(content: MessageContent): string {
  return todo("实现 extractText");
}

/**
 * 内容中是否包含执行失败（isError 为 true）的工具结果。字符串内容一律返回 false。
 *
 * 提示：数组的 some(callback) 在任意一个元素让 callback 返回 true 时返回 true。
 */
export function hasToolError(content: MessageContent): boolean {
  return todo("实现 hasToolError");
}
