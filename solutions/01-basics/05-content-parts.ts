/**
 * 练习 1-5：消息内容块 —— 参考答案
 */

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

function assertNever(value: never): never {
  throw new Error(`未处理的内容块：${JSON.stringify(value)}`);
}

/** 把一个内容块转换成纯文本。 */
export function partToText(part: ContentPart): string {
  switch (part.type) {
    case "text":
      return part.text;
    case "image": {
      // part.alt 是 string | undefined；?. 让 alt 为 undefined 时整个表达式也是 undefined。
      const alt = part.alt?.trim();
      // 这里用 || 而不是 ?? 是有意的：我们正好想把 ""（空白被 trim 之后）也当作"没有"。
      // ?? 只处理 undefined，空字符串会被保留，输出 "[图片: ]"。
      return `[图片: ${alt || part.url}]`;
    }
    case "tool_result":
      // isError 可能是 true、false 或不存在；=== true 让 false 和"不存在"走同一条路
      return `[${part.isError === true ? "工具错误" : "工具结果"} #${part.toolCallId}] ${part.output}`;
    default:
      return assertNever(part);
  }
}

/** 把整条消息内容转换成纯文本。 */
export function contentToText(content: MessageContent | undefined): string {
  if (content === undefined) return "";
  if (typeof content === "string") return content;
  // 走到这里，content 只可能是 readonly ContentPart[]
  return content.map(partToText).join("\n");
}

/** 类型守卫：判断一个内容块是不是文本块。 */
export function isTextPart(part: ContentPart): part is TextPart {
  return part.type === "text";
}

/** 只提取文字内容，忽略图片和工具结果。 */
export function extractText(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content
    .filter(isTextPart) // TextPart[]
    .map((part) => part.text)
    .join("\n");
}

/** 内容中是否包含执行失败的工具结果。 */
export function hasToolError(content: MessageContent): boolean {
  if (typeof content === "string") return false;
  // some：只要有一个元素满足条件就返回 true。
  // 回调里先判断 type，TypeScript 才允许访问 isError（只有 ToolResultPart 有这个属性）。
  return content.some((part) => part.type === "tool_result" && part.isError === true);
}
