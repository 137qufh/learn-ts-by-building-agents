/**
 * 把旧消息折成一段摘要，同时不拆开"工具调用 + 结果"（第 7 章）。
 *
 * 调用前应先用 repairHistory 补齐被中断的记录（6.5 节）。这里只保证：
 * 一条带着 tool_calls 的 assistant 消息和紧跟它的 tool 消息是一整块，要么都留下，要么都进摘要。
 */
import type { Message } from "./client.ts";

export interface CompactResult {
  messages: Message[];
  /** 被摘要替换的消息条数。没有折叠时是 0，并且不会调用 summarize。 */
  covered: number;
}

export function compactMessages(
  messages: readonly Message[],
  options: { keep: number; summarize: (dropped: readonly Message[]) => string },
): CompactResult {
  const { keep, summarize } = options;
  if (!Number.isInteger(keep) || keep < 0) {
    throw new RangeError(`keep 必须是非负整数，收到的是 ${keep}`);
  }

  const pinned: Message[] = [];
  let rest = messages;
  const first = messages[0];
  if (first?.role === "system") {
    pinned.push(first);
    rest = messages.slice(1);
  }

  const groups = groupMessages(rest);
  let keptCount = 0;
  let keptGroups = 0;
  for (let i = groups.length - 1; i >= 0; i--) {
    if (keptCount >= keep) break;
    keptCount += groups[i]?.length ?? 0;
    keptGroups++;
  }
  const dropGroups = groups.slice(0, groups.length - keptGroups);
  const keepGroups = groups.slice(groups.length - keptGroups);
  const dropped = dropGroups.flat();
  if (dropped.length === 0) {
    return { messages: [...pinned, ...keepGroups.flat()], covered: 0 };
  }

  const summary = summarize(dropped);
  const note: Message = {
    role: "user",
    content: `以下是更早对话的摘要，不是新的问题：\n${summary}`,
  };
  return { messages: [...pinned, note, ...keepGroups.flat()], covered: dropped.length };
}

function groupMessages(messages: readonly Message[]): Message[][] {
  const groups: Message[][] = [];
  let index = 0;
  while (index < messages.length) {
    const message = messages[index];
    if (message === undefined) break;
    if (
      message.role === "assistant" &&
      message.tool_calls !== undefined &&
      message.tool_calls.length > 0
    ) {
      const group: Message[] = [message];
      index++;
      while (index < messages.length && messages[index]?.role === "tool") {
        const toolMessage = messages[index];
        if (toolMessage !== undefined) group.push(toolMessage);
        index++;
      }
      groups.push(group);
      continue;
    }
    groups.push([message]);
    index++;
  }
  return groups;
}
