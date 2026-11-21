# 2.5 infer：从类型中提取类型

> 这一节要解决的问题：一个函数已经写好了，怎么拿到它的返回类型和参数类型，而不必再手写一遍？数组里装的是什么，`Promise` 里包的是什么，怎么用类型"拆"出来？

示例代码：[examples/05-infer.ts](examples/05-infer.ts)

## infer：模式匹配

```ts
type ElementOf<T> = T extends readonly (infer E)[] ? E : never;

type Tool = ElementOf<{ name: string; description: string }[]>; // { name: string; description: string }
type NotArray = ElementOf<string>; // never
```

`infer E` 只能出现在条件类型的 `extends` 子句里。它的意思是："看看 `T` 能不能匹配 `readonly (某个类型)[]` 这个模式；如果能，把"某个类型"叫做 `E`，在 `?` 后面的分支里使用"。

如果你用过正则表达式的捕获组，或者其他语言的模式匹配（Rust 的 `match`、Python 的 `match`），这是同一个思路：**描述形状，捕获其中的一部分**。匹配失败时走 `:` 后面的分支，通常返回 `never`。

> 模式写的是 `readonly (infer E)[]`，这样只读数组和普通数组都能匹配：普通数组能赋值给只读数组，反过来不行。

## 函数的返回值和参数

```ts
type MyReturnType<F> = F extends (...args: never[]) => infer R ? R : never;
type MyParameters<F> = F extends (...args: infer P) => unknown ? P : never;
```

标准库的 `ReturnType` 和 `Parameters` 就是这么实现的，区别只在于它们用 `any` 代替了这里的 `never[]` 和 `unknown`，并且约束了 `T` 必须是函数类型（传入非函数会直接报错，而不是得到 `never`）。配合类型位置的 `typeof`，可以从已有的函数"读出"类型：

```ts
function createClient(baseUrl: string, options: { timeoutMs: number; retries?: number }) {
  return { baseUrl, ...options, createdAt: Date.now() };
}

type Client = ReturnType<typeof createClient>;
// { timeoutMs: number; retries?: number; baseUrl: string; createdAt: number; }
type ClientOptions = Parameters<typeof createClient>[1];
// { timeoutMs: number; retries?: number; }
```

`Parameters` 得到的是一个 **带名字的元组**：`[baseUrl: string, options: {...}]`。名字只是给人看的标签，不影响类型；用 `[1]` 就能取出第二个参数的类型。

什么时候需要这样做？最典型的场景是 **使用别人的库**：SDK 导出了一个函数，却没有导出它的参数类型或返回类型。与其照着文档手抄一份（库升级后就过时了），不如用 `Parameters` 和 `ReturnType` 直接从函数取。

## 元组：取第一个、最后一个、其余

```ts
type First<T extends readonly unknown[]> = T extends readonly [infer F, ...unknown[]] ? F : never;
type Last<T extends readonly unknown[]> = T extends readonly [...unknown[], infer L] ? L : never;
type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : [];

type Pipeline = ["plan", "act", "observe", "reflect"];
type Start = First<Pipeline>; // "plan"
type End = Last<Pipeline>; // "reflect"
type AfterStart = Tail<Pipeline>; // ["act", "observe", "reflect"]
```

元组模式里的 `...` 和 JavaScript 的剩余参数一样，表示"任意多个"。`infer` 可以出现在模式里的任何位置，也可以出现多次。

## 递归地拆开嵌套的类型

`infer` 和递归结合，可以一层层拆开嵌套的类型：

```ts
type UnwrapPromise<T> = T extends Promise<infer V> ? UnwrapPromise<V> : T;
type Deep = UnwrapPromise<Promise<Promise<string>>>; // string
```

`Promise<T>` 表示"将来会得到一个 `T`"，第 3 章会详细讲。这里只需要知道：`async` 函数的返回类型总是 `Promise<...>`。标准库提供了现成的 `Awaited<T>`，和上面的 `UnwrapPromise` 作用相同，处理得更周全。它和 `ReturnType` 组合，是拿到异步函数"真正返回的数据"类型的标准写法：

```ts
async function fetchWeather(city: string) {
  return { city, condition: "晴", temperature: 25 };
}

type Weather = Awaited<ReturnType<typeof fetchWeather>>;
// { city: string; condition: string; temperature: number; }
```

## 给 infer 加约束

`infer X extends 约束` 只在推断出的类型满足约束时才算匹配成功：

```ts
type FirstString<T extends readonly unknown[]> = T extends readonly [
  infer S extends string,
  ...unknown[],
]
  ? S
  : never;

type G = FirstString<["search", 1]>; // "search"
type H = FirstString<[1, "search"]>; // never
```

没有约束时也能写成两层条件类型（先 `infer S`，再判断 `S extends string`），约束让它更简洁。下一节从字符串里解析数字时会用到它。

## 从一组函数推导出参数表

agent 里经常有一张"工具名 → 处理函数"的表。用映射类型配合 `infer`，可以直接从表里推导出每个工具的参数类型：

```ts
const handlers = {
  get_weather: (args: { city: string; unit?: "c" | "f" }) => `${args.city} 晴`,
  search: (args: { query: string; limit: number }) => [`结果：${args.query}`],
};

type ArgsOf<H> = { [K in keyof H]: H[K] extends (args: infer A) => unknown ? A : never };
type ToolArgs = ArgsOf<typeof handlers>;
// { get_weather: { city: string; unit?: "c" | "f" }; search: { query: string; limit: number } }
```

新增一个工具时，`ToolArgs` 自动更新。章末项目会把这个思路发展成完整的工具注册表。

## 不写 infer 也能推断

泛型函数的类型参数本身就是一种推断。很多时候，与其在类型里用 `infer` 拆开函数类型，不如直接让泛型函数的类型参数去"接住"它的各个部分：

```ts
function withLogging<A extends unknown[], R>(
  name: string,
  fn: (...args: A) => R,
): (...args: A) => R {
  return (...args) => {
    console.log(`→ ${name}`, ...args);
    return fn(...args);
  };
}

const loggedWeather = withLogging("get_weather", handlers.get_weather);
// (args: { city: string; unit?: "c" | "f" }) => string
```

`A extends unknown[]` 接住参数列表（一个元组），`R` 接住返回值。包装后的函数和原函数的签名完全一样。给工具加日志、计时、重试、超时，都是这种"包装函数"，第 3 章和第 6 章会大量使用。

经验法则：**在函数签名里，优先用泛型参数推断；在类型定义里（没有函数调用可以推断时），才用 `infer`。**

## 小结

- `infer X` 只能用在条件类型的 `extends` 里，表示"匹配这个模式，把这部分捕获为 `X`"
- `ReturnType`、`Parameters`、`Awaited` 都基于 `infer`；配合类型位置的 `typeof`，可以从已有的函数读出类型
- 元组模式 `[infer F, ...infer Rest]` 可以取出首、尾、其余元素；`infer` 可以递归使用
- `infer X extends 约束` 只在满足约束时匹配
- 在函数签名里，泛型参数（如 `<A extends unknown[], R>`）往往比 `infer` 更直接

## 练习

[exercises/02-advanced-types/05-tool-wrappers.ts](../../exercises/02-advanced-types/05-tool-wrappers.ts)：用 `infer` 和泛型参数为工具函数写包装器：记录调用、失败时回退、缓存结果。运行 `pnpm ex 05-tool-wrappers`。

下一节：[2.6 模板字面量类型](06-template-literal-types.md)
