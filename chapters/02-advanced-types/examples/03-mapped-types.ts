// 运行：pnpm tsx chapters/02-advanced-types/examples/03-mapped-types.ts
// 配套课程：2.3 映射类型

interface ModelSettings {
  model: string;
  temperature: number;
  maxTokens?: number;
  readonly stream: boolean;
}

// ── 基本语法：遍历一个联合，为每个成员生成一个属性 ──────────────────
type Flags = { [K in "search" | "read_file" | "write_file"]: boolean };
// { search: boolean; read_file: boolean; write_file: boolean; }
const enabled: Flags = { search: true, read_file: true, write_file: false };
console.log(enabled.write_file); // false

// Record 就是这样实现的（内置定义：type Record<K extends keyof any, T> = { [P in K]: T }）
type MyRecord<K extends PropertyKey, V> = { [P in K]: V };
const limits: MyRecord<"rpm" | "tpm", number> = { rpm: 500, tpm: 30_000 };
console.log(limits.tpm); // 30000

// ── 遍历 keyof T：基于已有类型生成新类型 ──────────────────────────
type Stringified<T> = { [K in keyof T]: string };
const fromEnv: Stringified<ModelSettings> = {
  model: "gpt-5",
  temperature: "0.7",
  stream: "true",
}; // maxTokens 依然可选，stream 依然只读 —— 遍历 keyof T 会保留原来的修饰符
console.log(fromEnv.temperature); // 0.7

// 值的类型可以引用 T[K]：每个属性都"知道"自己原来的类型
type Comparators<T> = { [K in keyof T]-?: (a: T[K], b: T[K]) => boolean };
const same = <V>(a: V, b: V): boolean => a === b;
const settingComparators: Comparators<ModelSettings> = {
  model: (a, b) => a.toLowerCase() === b.toLowerCase(), // a、b 自动推断为 string
  temperature: (a, b) => Math.abs(a - b) < 1e-9, // number
  maxTokens: same,
  stream: same,
};
console.log(settingComparators.model("GPT-5", "gpt-5")); // true

// @ts-expect-error -- Property 'stream' is missing in type '{ model: ...; temperature: ...; maxTokens: ...; }' but required in type 'Comparators<ModelSettings>'.
const incomplete: Comparators<ModelSettings> = {
  model: same,
  temperature: same,
  maxTokens: same,
};
void incomplete;

// ── 修饰符：加上或去掉 readonly 和 ? ──────────────────────────────
type MyPartial<T> = { [K in keyof T]?: T[K] };
type MyRequired<T> = { [K in keyof T]-?: T[K] };
type MyReadonly<T> = { readonly [K in keyof T]: T[K] };
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const patch: MyPartial<ModelSettings> = { temperature: 0 }; // 全部可选
const full: MyRequired<ModelSettings> = {
  model: "gpt-5",
  temperature: 0,
  maxTokens: 1,
  stream: true,
};
const frozen: MyReadonly<ModelSettings> = full;
// @ts-expect-error -- Cannot assign to 'model' because it is a read-only property.
frozen.model = "other";

const editable: Mutable<ModelSettings> = { ...full };
editable.stream = false; // ✅ 去掉了 readonly
console.log(patch, editable.stream); // { temperature: 0 } false

// ── 键重映射：用 as 改写键名 ──────────────────────────────────────
type Setters<T> = { [K in keyof T as `set${Capitalize<K & string>}`]: (value: T[K]) => void };
type SettingSetters = Setters<Pick<ModelSettings, "model" | "temperature">>;
// { setModel: (value: string) => void; setTemperature: (value: number) => void; }
const setters: SettingSetters = {
  setModel: (value) => console.log("model =", value),
  setTemperature: (value) => console.log("temperature =", value.toFixed(1)),
};
setters.setTemperature(0.25); // temperature = 0.3

// as 映射到 never 的键会被删掉：这就能"过滤"属性
type WithoutStream<T> = { [K in keyof T as Exclude<K, "stream">]: T[K] };
const noStream: WithoutStream<ModelSettings> = { model: "gpt-5", temperature: 1 };
console.log(Object.keys(noStream)); // [ 'model', 'temperature' ]

// ── 映射数组和元组，得到的还是数组和元组 ──────────────────────────
type Nullable<T> = { [K in keyof T]: T[K] | null };
type Row = Nullable<[string, number]>; // [string | null, number | null]
const row: Row = ["gpt-5", null];
console.log(row.length); // 2
