/**
 * 第 1 章项目：聊天记录（transcript）的类型模型 —— 参考答案
 */

// ─────────────────────────────── 类型 ───────────────────────────────

export type Role = "system" | "user" | "assistant" | "tool";

export interface SystemMessage {
  role: "system";
  content: string;
}

export interface UserMessage {
  role: "user";
  content: string;
}

/** 模型请求调用的一个工具。 */
export interface ToolCall {
  /** 由模型生成的唯一 ID，工具结果通过它和这次调用对应起来 */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AssistantMessage {
  role: "assistant";
  /** 模型说的话；只调用工具、什么都不说时为空字符串 */
  content: string;
  /** 模型请求的工具调用；没有时不存在这个属性（而不是空数组） */
  toolCalls?: readonly ToolCall[];
}

export interface ToolMessage {
  role: "tool";
  /** 对应的 ToolCall.id */
  toolCallId: string;
  content: string;
  /** 工具执行失败时为 true；成功时不存在这个属性 */
  isError?: boolean;
}

export type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

export type Transcript = readonly Message[];

function assertNever(value: never): never {
  throw new Error(`未知的消息：${JSON.stringify(value)}`);
}

// ───────────────────────────── 构造函数 ─────────────────────────────

export function systemMessage(content: string): SystemMessage {
  return { role: "system", content };
}

export function userMessage(content: string): UserMessage {
  return { role: "user", content };
}

export function assistantMessage(
  content: string,
  toolCalls?: readonly ToolCall[],
): AssistantMessage {
  // toolCalls?.length 在 toolCalls 为 undefined 时是 undefined，和 0 一样是假值，
  // 所以这一个判断同时排除了 undefined 和空数组。
  // （这里对 number 用真值判断是安全的：长度为 0 正是我们要排除的情况。）
  if (!toolCalls?.length) {
    return { role: "assistant", content };
  }
  return { role: "assistant", content, toolCalls };
}

export function toolMessage(
  toolCallId: string,
  content: string,
  options: { isError?: boolean } = {},
): ToolMessage {
  const message: ToolMessage = { role: "tool", toolCallId, content };
  // exactOptionalPropertyTypes 下不能写 isError: options.isError（可能是 undefined），
  // 所以只在为 true 时加上这个属性。
  return options.isError === true ? { ...message, isError: true } : message;
}

// ─────────────────────────────── 渲染 ───────────────────────────────

/** "[label] content"；content 为空时只保留 "[label]"。 */
function line(label: string, content: string): string {
  return content === "" ? `[${label}]` : `[${label}] ${content}`;
}

export function renderMessage(message: Message): string {
  switch (message.role) {
    case "system":
    case "user":
      // 两个 case 共用一段代码；这里 message 的类型是 SystemMessage | UserMessage
      return line(message.role, message.content);
    case "assistant": {
      const calls = (message.toolCalls ?? []).map(
        (call) => `  → ${call.name}(${JSON.stringify(call.arguments)}) #${call.id}`,
      );
      return [line("assistant", message.content), ...calls].join("\n");
    }
    case "tool": {
      const label = `tool #${message.toolCallId}`;
      if (message.isError === true) {
        // "ERROR:" 总是保留，所以单独处理 content 为空的情况
        return message.content === ""
          ? `[${label}] ERROR:`
          : `[${label}] ERROR: ${message.content}`;
      }
      return line(label, message.content);
    }
    default:
      return assertNever(message);
  }
}

export function renderTranscript(transcript: Transcript): string {
  return transcript.map(renderMessage).join("\n");
}

// ─────────────────────────────── 分析 ───────────────────────────────

export function countByRole(transcript: Transcript): Record<Role, number> {
  const counts: Record<Role, number> = { system: 0, user: 0, assistant: 0, tool: 0 };
  for (const message of transcript) {
    counts[message.role] += 1;
  }
  return counts;
}

export function pendingToolCalls(transcript: Transcript): ToolCall[] {
  // 按顺序扫描：遇到 assistant 就把它的调用加入等待列表，遇到 tool 就把对应的调用移出。
  // 因为是按顺序处理的，"出现在调用之前的结果"自然不会被算进去。
  let pending: ToolCall[] = [];
  for (const message of transcript) {
    if (message.role === "assistant") {
      pending.push(...(message.toolCalls ?? []));
    } else if (message.role === "tool") {
      pending = pending.filter((call) => call.id !== message.toolCallId);
    }
  }
  return pending;
}

export function validateTranscript(transcript: Transcript): string[] {
  const problems: string[] = [];
  const issuedIds = new Set<string>(); // 所有发起过的工具调用 ID
  let pendingIds: string[] = []; // 还在等待结果的 ID，按发起顺序

  transcript.forEach((message, index) => {
    const n = index + 1;
    const report = (problem: string) => problems.push(`第 ${n} 条：${problem}`);

    // 规则 4：在等待工具结果时，不能出现 user / assistant 消息
    const checkNoPending = () => {
      if (pendingIds.length > 0) {
        report(`工具调用 ${pendingIds.join(", ")} 还没有结果，不能出现 ${message.role} 消息`);
      }
    };

    switch (message.role) {
      case "system":
        if (index !== 0) report("system 消息只能出现在开头");
        break;
      case "user":
        checkNoPending();
        break;
      case "assistant":
        checkNoPending();
        for (const call of message.toolCalls ?? []) {
          if (issuedIds.has(call.id)) {
            report(`工具调用 ID ${call.id} 重复`);
          } else {
            issuedIds.add(call.id);
            pendingIds.push(call.id);
          }
        }
        break;
      case "tool": {
        const id = message.toolCallId;
        if (pendingIds.includes(id)) {
          pendingIds = pendingIds.filter((pendingId) => pendingId !== id);
        } else if (issuedIds.has(id)) {
          report(`工具调用 ${id} 被重复回应`);
        } else {
          report(`tool 消息引用了未知的工具调用 ${id}`);
        }
        break;
      }
      default:
        assertNever(message);
    }
  });

  return problems;
}
