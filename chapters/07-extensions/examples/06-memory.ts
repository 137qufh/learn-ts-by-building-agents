// 7.6 折叠旧消息时不拆开工具调用
// 运行：node chapters/07-extensions/examples/06-memory.ts
//
// 预期输出：
// covered 1
// roles system,user,assistant,tool
// found 买牛奶

type Msg =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool?: string }
  | { role: "tool"; content: string };

const messages: Msg[] = [
  { role: "system", content: "规则" },
  { role: "user", content: "昨天的问题" },
  { role: "assistant", content: null, tool: "add" },
  { role: "tool", content: "3" },
];
const pinned = messages[0]?.role === "system" ? [messages[0]] : [];
const rest = pinned.length === 0 ? messages : messages.slice(1);
const groups: Msg[][] = [];
for (let i = 0; i < rest.length; i++) {
  const message = rest[i];
  if (message === undefined) break;
  if (message.role === "assistant" && message.tool !== undefined) {
    const group: Msg[] = [message];
    const next = rest[i + 1];
    if (next?.role === "tool") {
      group.push(next);
      i += 1;
    }
    groups.push(group);
  } else {
    groups.push([message]);
  }
}
const kept = groups.at(-1) ?? [];
const dropped = groups.slice(0, -1).flat();
const summary: Msg = { role: "user", content: `摘要：${dropped.length} 条` };
console.log("covered", dropped.length);
console.log("roles", [...pinned, summary, ...kept].map((message) => message.role).join(","));

function tokens(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const list: string[] = [];
  for (const word of words) {
    list.push(word);
    const chars = Array.from(word);
    if (chars.length <= 2) continue;
    for (let i = 0; i < chars.length - 1; i++) list.push(`${chars[i] ?? ""}${chars[i + 1] ?? ""}`);
  }
  return list;
}
const query = new Set(tokens("牛奶"));
const memory = ["买牛奶", "量子力学"];
const hit = memory.find((text) => tokens(text).some((token) => query.has(token)));
console.log("found", hit);
