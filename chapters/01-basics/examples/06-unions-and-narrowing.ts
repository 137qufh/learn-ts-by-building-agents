// 运行：pnpm tsx chapters/01-basics/examples/06-unions-and-narrowing.ts
// 配套课程：1.6 联合类型与类型收窄

// ── 联合类型：只能使用所有成员共有的东西 ──────────────────────────
function lengthOf(content: string | string[]): number {
  return content.length; // ✅ string 和 string[] 都有 length
}
console.log(lengthOf("hi"), lengthOf(["a", "b", "c"])); // 2 3

function shout(content: string | string[]): string {
  // @ts-expect-error -- Property 'toUpperCase' does not exist on type 'string | string[]'.
  return content.toUpperCase();
}
void shout;

// ── typeof 收窄 ──────────────────────────────────────────────────
function formatValue(value: string | number | boolean): string {
  if (typeof value === "string") {
    return `"${value}"`; // 这里 value 是 string
  }
  if (typeof value === "number") {
    return value.toFixed(2); // 这里是 number
  }
  return value ? "yes" : "no"; // 前面都 return 了，剩下的只能是 boolean
}
console.log(formatValue("hi"), formatValue(3.14159), formatValue(true)); // "hi" 3.14 yes

// typeof null 是 "object"，这是 JavaScript 的历史遗留问题
console.log(typeof null, typeof [], typeof {}); // object object object

// ── Array.isArray 收窄 ───────────────────────────────────────────
function toText(content: string | string[]): string {
  return Array.isArray(content) ? content.join("\n") : content;
}
console.log(toText(["第一行", "第二行"]));

// ── 真值收窄与它的陷阱 ───────────────────────────────────────────
function greet(name: string | undefined): string {
  if (name) {
    return `你好，${name}`; // name 是 string
  }
  return "你好"; // 注意：空字符串 "" 也会走到这里
}
console.log(greet("Ada"), greet(undefined), greet("")); // 你好，Ada 你好 你好

// 假值（falsy）一共只有这几个：false、0、-0、0n、""、null、undefined、NaN
function describeLimit(maxTokens: number | undefined): string {
  if (!maxTokens) return "不限制"; // ❗ bug：maxTokens 为 0 时也会走到这里
  return `最多 ${maxTokens}`;
}
console.log(describeLimit(0)); // 不限制 —— 本意是"0 个 token"

function describeLimitFixed(maxTokens: number | undefined): string {
  if (maxTokens === undefined) return "不限制";
  return `最多 ${maxTokens}`;
}
console.log(describeLimitFixed(0)); // 最多 0

// ── ?? 与 || ─────────────────────────────────────────────────────
const temperature: number | undefined = 0;
console.log(temperature || 1); // 1 —— || 把 0 当成"没有"
console.log(temperature ?? 1); // 0 —— ?? 只在 null / undefined 时取右边

// ── ?. 可选链 ────────────────────────────────────────────────────
interface ApiResponse {
  usage?: { inputTokens: number };
}
const response: ApiResponse = {};
console.log(response.usage?.inputTokens); // undefined —— usage 不存在时整个表达式就是 undefined
console.log(response.usage?.inputTokens ?? 0); // 0

// ── in 收窄 ──────────────────────────────────────────────────────
interface TextBlock {
  text: string;
}
interface ImageBlock {
  url: string;
}
function describeBlock(block: TextBlock | ImageBlock): string {
  if ("text" in block) {
    return `文本：${block.text}`;
  }
  return `图片：${block.url}`;
}
console.log(describeBlock({ text: "hi" }), describeBlock({ url: "https://example.com/a.png" }));

// ── instanceof 收窄 ──────────────────────────────────────────────
function errorMessage(error: Error | string): string {
  return error instanceof Error ? error.message : error;
}
console.log(errorMessage(new Error("超时")), errorMessage("网络断开")); // 超时 网络断开

// ── 可辨识联合：用一个字面量字段区分成员 ──────────────────────────
type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "error"; message: string };

function render(event: AgentEvent): string {
  switch (event.type) {
    case "text":
      return event.text; // 这里 event 被收窄成 { type: "text"; text: string }
    case "tool_call":
      return `→ ${event.name}(${JSON.stringify(event.args)})`;
    case "error":
      return `✗ ${event.message}`;
  }
}

const events: AgentEvent[] = [
  { type: "text", text: "我来查一下。" },
  { type: "tool_call", id: "call_1", name: "search", args: { q: "TypeScript 7" } },
  { type: "error", message: "搜索服务超时" },
];
for (const event of events) console.log(render(event));
// 我来查一下。
// → search({"q":"TypeScript 7"})
// ✗ 搜索服务超时

// ── 穷尽性检查：漏处理一种情况就编译失败 ──────────────────────────
function assertNever(value: never): never {
  throw new Error(`未处理的情况：${JSON.stringify(value)}`);
}

function isTerminal(event: AgentEvent): boolean {
  switch (event.type) {
    case "text":
    case "tool_call":
      return false;
    case "error":
      return true;
    default:
      // 所有情况都处理了，这里 event 的类型是 never。
      // 如果以后给 AgentEvent 加了新成员却忘了处理，这一行会报错。
      return assertNever(event);
  }
}
console.log(events.map(isTerminal)); // [ false, false, true ]

type Shape = { kind: "circle"; r: number } | { kind: "square"; side: number };
function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.r ** 2;
    default:
      // @ts-expect-error -- Argument of type '{ kind: "square"; side: number; }' is not assignable to parameter of type 'never'.
      return assertNever(shape); // 漏了 "square"，编译器当场指出
  }
}
void area;

// ── 自定义类型守卫：value is T ───────────────────────────────────
type ToolCallEvent = Extract<AgentEvent, { type: "tool_call" }>; // 从联合里取出 tool_call 那一个成员

function isToolCall(event: AgentEvent): event is ToolCallEvent {
  return event.type === "tool_call";
}
const calls = events.filter(isToolCall); // ToolCallEvent[]
console.log(calls.map((c) => c.name)); // [ 'search' ]
