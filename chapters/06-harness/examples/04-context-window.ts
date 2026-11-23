// 6.4 上下文管理：token 预算与截断
// 运行：pnpm tsx chapters/06-harness/examples/04-context-window.ts

// ── 1. 估算 token：按码点遍历，区分中日韩文字 ────────────────────────
const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function estimateTokens(text: string): number {
  let wide = 0;
  let other = 0;
  for (const char of text) {
    if (WIDE.test(char)) wide++;
    else other++;
  }
  return wide + Math.ceil(other / 4);
}

for (const text of ["Hello, world", "你好世界", "用 TypeScript 写 agent", "🙂🙂🙂🙂"]) {
  console.log(
    `${JSON.stringify(text)}：${text.length} 个 UTF-16 单元，约 ${estimateTokens(text)} token`,
  );
}
// "Hello, world"：12 个 UTF-16 单元，约 3 token
// "你好世界"：4 个 UTF-16 单元，约 4 token
// "用 TypeScript 写 agent"：20 个 UTF-16 单元，约 7 token（2 个汉字 + 18 个其他字符）
// "🙂🙂🙂🙂"：8 个 UTF-16 单元，约 1 token  ← 4 个 emoji，每个占 2 个 UTF-16 单元

// ── 2. 截断工具的输出：保留开头和结尾 ─────────────────────────────────
function truncateMiddle(text: string, maxChars: number): string {
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  const head = Math.ceil(maxChars / 2);
  const tail = maxChars - head;
  return `${chars.slice(0, head).join("")}\n…（中间省略了 ${chars.length - maxChars} 个字符）…\n${tail === 0 ? "" : chars.slice(-tail).join("")}`;
}

const testOutput = [
  "> vitest run",
  ...Array.from({ length: 200 }, (_, i) => ` ✓ test ${i + 1}`),
  " × total > 数量为负数时应该报错",
  "Tests  1 failed | 200 passed",
].join("\n");
console.log(`\n测试输出有 ${testOutput.length} 个字符，截断到 120 个：`);
console.log(truncateMiddle(testOutput, 120));
// > vitest run
//  ✓ test 1
//  ……
// …（中间省略了 2235 个字符）…
//  test 200
//  × total > 数量为负数时应该报错
// Tests  1 failed | 200 passed       ← 最重要的信息在结尾，保住了

// ── 3. 分组：工具调用和结果不能拆开 ───────────────────────────────────
type Message = { role: "system" | "user" | "assistant" | "tool"; content: string };
const history: Message[] = [
  { role: "system", content: "你是助手" },
  { role: "user", content: "读一下 a.ts" },
  { role: "assistant", content: "（调用 read_file）" },
  { role: "tool", content: "a.ts 的内容……" },
  { role: "assistant", content: "a.ts 定义了……" },
  { role: "user", content: "那 b.ts 呢？" },
];

const groups: Message[][] = [];
for (const message of history.slice(1)) {
  const last = groups.at(-1);
  if (message.role === "tool" && last !== undefined) last.push(message);
  else groups.push([message]);
}
console.log("\n分组：");
for (const group of groups) console.log(`  [${group.map((m) => m.role).join(" + ")}]`);
//   [user]
//   [assistant + tool]   ← 一起保留，或者一起省略
//   [assistant]
//   [user]

// ── 4. 省略最早的组，插入说明 ─────────────────────────────────────────
const budget = 2; // 为了演示，按"组"计算预算：只放得下最后两组
const dropped = groups.slice(0, -budget).flat().length;
const window = [
  history[0]!,
  { role: "system", content: `（为了控制上下文长度，更早的 ${dropped} 条消息已经省略）` },
  ...groups.slice(-budget).flat(),
];
console.log("\n发给模型的窗口：");
for (const message of window) console.log(`  ${message.role}: ${message.content}`);
//   system: 你是助手
//   system: （为了控制上下文长度，更早的 3 条消息已经省略）
//   assistant: a.ts 定义了……
//   user: 那 b.ts 呢？
console.log(`完整的记录仍然有 ${history.length} 条`); // 完整的记录仍然有 6 条
