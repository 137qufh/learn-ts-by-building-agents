// 运行：pnpm tsx chapters/01-basics/examples/02-objects-and-interfaces.ts
// 配套课程：1.2 对象类型、interface 与 type

// ── 用 interface 描述对象的形状 ───────────────────────────────────
interface ChatMessage {
  role: string;
  content: string;
  name?: string; // ? 表示可选：可以没有这个属性
  readonly createdAt: number; // readonly：创建后不能再改
}

const hello: ChatMessage = { role: "user", content: "你好", createdAt: Date.now() };
hello.content = "你好呀"; // ✅ 普通属性可以修改
// @ts-expect-error -- Cannot assign to 'createdAt' because it is a read-only property.
hello.createdAt = 0;

// 可选属性读出来的类型自动带上 undefined，使用前要先检查
const displayName: string | undefined = hello.name;
console.log(displayName ?? "(匿名)"); // (匿名)   —— ?? 的意思见 1.6 节

// ── 缺少必需属性会报错 ─────────────────────────────────────────────
// @ts-expect-error -- Property 'createdAt' is missing in type '{ role: string; content: string; }' but required in type 'ChatMessage'.
const incomplete: ChatMessage = { role: "user", content: "hi" };
void incomplete;

// ── 结构类型：只看形状，不看名字 ───────────────────────────────────
interface Point {
  x: number;
  y: number;
}
interface Vector {
  x: number;
  y: number;
}
const p: Point = { x: 1, y: 2 };
const v: Vector = p; // ✅ 形状相同就兼容，不需要声明"Point 实现了 Vector"
console.log(v); // { x: 1, y: 2 }

// 多出来的属性也没关系：有 x、y 就满足 Point
const point3d = { x: 1, y: 2, z: 3 };
const flat: Point = point3d; // ✅
console.log(flat); // { x: 1, y: 2, z: 3 } —— 注意 z 依然在，类型不会删除数据

// ── 多余属性检查：只针对"直接写出来的对象字面量" ─────────────────
const typo: ChatMessage = {
  role: "user",
  // @ts-expect-error -- Object literal may only specify known properties, but 'contnet' does not exist in type 'ChatMessage'. Did you mean to write 'content'?
  contnet: "拼错了",
  content: "",
  createdAt: 0,
};
void typo;

// ── type 别名：给任何类型起名字 ───────────────────────────────────
type Usage = {
  inputTokens: number;
  outputTokens: number;
};
type ModelName = string; // 也可以给基本类型起别名
type Temperature = number;

const usage: Usage = { inputTokens: 120, outputTokens: 30 };
const name: ModelName = "gpt-5";
const temp: Temperature = 0.2;
console.log(usage, name, temp);

// ── 扩展：interface 用 extends，type 用 & ─────────────────────────
interface BaseEvent {
  id: string;
  timestamp: number;
}
interface ToolCallEvent extends BaseEvent {
  toolName: string;
}
type ErrorEvent = BaseEvent & { message: string };

const call: ToolCallEvent = { id: "e1", timestamp: 0, toolName: "search" };
const failure: ErrorEvent = { id: "e2", timestamp: 0, message: "timeout" };
console.log(call.toolName, failure.message); // search timeout

// extends 会检查冲突：子接口里 id 改成 number 直接报错
// @ts-expect-error -- Interface 'BadEvent' incorrectly extends interface 'BaseEvent'.
interface BadEvent extends BaseEvent {
  id: number;
}

// & 不会报错，而是悄悄得到一个不可能的类型：id 既是 string 又是 number → never
type SilentlyBroken = BaseEvent & { id: number };
// @ts-expect-error -- Type 'string' is not assignable to type 'never'.
const broken: SilentlyBroken = { id: "x", timestamp: 0 };
void broken;

// ── 声明合并：同名 interface 会自动合并 ────────────────────────────
interface Settings {
  model: string;
}
interface Settings {
  maxTokens: number;
}
const settings: Settings = { model: "gpt-5", maxTokens: 1024 }; // 两个属性都要有
console.log(settings);

// ── 键不固定的对象：Record 与索引签名 ─────────────────────────────
// 模型返回的工具参数：键是什么事先不知道，值的类型也不确定
const toolArguments: Record<string, unknown> = { query: "TypeScript", limit: 5 };
// 等价写法：{ [key: string]: unknown }

// 开启 noUncheckedIndexedAccess 后，按任意键读取的结果都带上 | undefined：
const limit = toolArguments["limit"]; // unknown（unknown 本身已包含 undefined）
const prices: Record<string, number> = { "gpt-5": 1.25 };
const price = prices["claude"]; // number | undefined —— 这个键可能不存在
console.log(limit, price); // 5 undefined
