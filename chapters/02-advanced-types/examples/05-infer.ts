// 运行：pnpm tsx chapters/02-advanced-types/examples/05-infer.ts
// 配套课程：2.5 infer：从类型中提取类型

// ── infer：在 extends 的模式里声明一个"待推断"的类型变量 ───────────────
type ElementOf<T> = T extends readonly (infer E)[] ? E : never;
type Tool = ElementOf<{ name: string; description: string }[]>; // { name: string; description: string }
type NotArray = ElementOf<string>; // never
const tool: Tool = { name: "search", description: "搜索网页" };
console.log(tool.name);

// ── 函数的返回值和参数：标准库的 ReturnType、Parameters 就是这样写的 ───
type MyReturnType<F> = F extends (...args: never[]) => infer R ? R : never;
type MyParameters<F> = F extends (...args: infer P) => unknown ? P : never;

function createClient(baseUrl: string, options: { timeoutMs: number; retries?: number }) {
  return { baseUrl, ...options, createdAt: Date.now() };
}

// 从已有的函数"读出"类型，而不是再手写一遍
type Client = MyReturnType<typeof createClient>;
// { timeoutMs: number; retries?: number; baseUrl: string; createdAt: number; }
type ClientArgs = MyParameters<typeof createClient>;
// [baseUrl: string, options: { timeoutMs: number; retries?: number; }]
type ClientOptions = ClientArgs[1]; // { timeoutMs: number; retries?: number; }

const options: ClientOptions = { timeoutMs: 30_000 };
const client: Client = createClient("https://api.openai.com/v1", options);
console.log(client.timeoutMs); // 30000

// ── 元组：取第一个、最后一个、其余 ────────────────────────────────
type First<T extends readonly unknown[]> = T extends readonly [infer F, ...unknown[]] ? F : never;
type Last<T extends readonly unknown[]> = T extends readonly [...unknown[], infer L] ? L : never;
type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : [];

type Pipeline = ["plan", "act", "observe", "reflect"];
type Start = First<Pipeline>; // "plan"
type End = Last<Pipeline>; // "reflect"
type AfterStart = Tail<Pipeline>; // ["act", "observe", "reflect"]
const steps: [Start, End, AfterStart["length"]] = ["plan", "reflect", 3];
console.log(steps);

// ── 递归地拆开嵌套的类型 ──────────────────────────────────────────
// Promise<T> 表示"将来会得到一个 T"（第 3 章详讲）；标准库的 Awaited 会一层层拆开它
type UnwrapPromise<T> = T extends Promise<infer V> ? UnwrapPromise<V> : T;
type Deep = UnwrapPromise<Promise<Promise<string>>>; // string
const deep: Deep = "已经拆开了";
console.log(deep);

async function fetchWeather(city: string) {
  return { city, condition: "晴", temperature: 25 };
}
// 异步函数的返回类型是 Promise<...>，用 Awaited 拿到里面真正的数据类型
type Weather = Awaited<ReturnType<typeof fetchWeather>>;
const weather: Weather = { city: "北京", condition: "晴", temperature: 25 };
console.log(weather.condition);

// ── infer 加约束：只在推断出的类型满足条件时匹配 ────────────────────
type FirstString<T extends readonly unknown[]> = T extends readonly [
  infer S extends string,
  ...unknown[],
]
  ? S
  : never;
type G = FirstString<["search", 1]>; // "search"
type H = FirstString<[1, "search"]>; // never
const g: G = "search";
console.log(g);

// ── 从一组处理函数推导出参数表 ─────────────────────────────────────
const handlers = {
  get_weather: (args: { city: string; unit?: "c" | "f" }) => `${args.city} 晴`,
  search: (args: { query: string; limit: number }) => [`结果：${args.query}`],
};
type ArgsOf<H> = { [K in keyof H]: H[K] extends (args: infer A) => unknown ? A : never };
type ToolArgs = ArgsOf<typeof handlers>;
// { get_weather: { city: string; unit?: "c" | "f" }; search: { query: string; limit: number } }
const searchArgs: ToolArgs["search"] = { query: "TypeScript", limit: 3 };
console.log(handlers.search(searchArgs)); // [ '结果：TypeScript' ]

// ── 不写 infer 也能推断：泛型函数的类型参数本身就是"推断" ────────────
function withLogging<A extends unknown[], R>(
  name: string,
  fn: (...args: A) => R,
): (...args: A) => R {
  return (...args) => {
    console.log(`→ ${name}`, ...args);
    return fn(...args);
  };
}
const loggedWeather = withLogging("get_weather", handlers.get_weather); // 参数和返回值类型都保留了
console.log(loggedWeather({ city: "上海" })); // 先打印 → get_weather { city: '上海' }，再打印 上海 晴
function neverCalled(): void {
  // @ts-expect-error -- Object literal may only specify known properties, and 'town' does not exist in type '{ city: string; unit?: "c" | "f"; }'.
  loggedWeather({ town: "上海" });
}
void neverCalled;
