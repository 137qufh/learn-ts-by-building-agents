# 2.1 泛型

> 这一节要解决的问题：同一段逻辑要处理不同类型的数据，比如"取数组的第一个元素"，对字符串数组和数字数组都成立。怎么写一次，又不丢掉类型信息？

示例代码：[examples/01-generics.ts](examples/01-generics.ts)

## 问题：any 会丢掉类型

先试试不用泛型：

```ts
function firstAny(items: readonly any[]): any {
  return items[0];
}

const model = firstAny(["gpt-5", "claude"]); // any
model.toFixed(2); // 不报错，运行时却会抛 TypeError
```

传进去的明明是字符串数组，出来的却是 `any`，后面怎么用都不会报错。换成 `unknown` 安全一些，但每次使用前都要自己收窄，等于把类型信息扔掉再找回来。为每种类型各写一个函数（`firstString`、`firstNumber`……）显然也不现实。

## 泛型函数

```ts
function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}

const firstModel = first(["gpt-5", "claude"]); // string | undefined
const firstTokens = first([1024, 2048]); // number | undefined
```

`<T>` 声明了一个 **类型参数**。可以把它理解成"类型层面的函数参数"：普通参数在调用时接收一个值，类型参数在调用时接收一个类型。上面的签名读作："对于任意类型 `T`，接收一个 `T` 的数组，返回 `T` 或 `undefined`"。

调用时，TypeScript 根据实参 **推断** 出 `T`：传入 `string[]`，`T` 就是 `string`，返回类型随之变成 `string | undefined`。输入和输出之间的关系被保留了下来，这正是泛型的意义。

推断不出来、或者想明确指定时，可以手动写类型参数：

```ts
const none = first<string>([]); // 空数组推断不出元素类型，手动指定
```

> 类型参数的名字随意，惯例是单个大写字母：`T`（type）、`K`（key）、`V`（value）、`E`（error）、`R`（result）。含义不明显时，用完整的名字更清楚，例如 `<TMessage>`、`<TModel>`。

### 多个类型参数

```ts
function mapValues<V, R>(record: Record<string, V>, fn: (value: V) => R): Record<string, R> {
  const result: Record<string, R> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = fn(value);
  }
  return result;
}

const lengths = mapValues({ system: "你是助手", user: "你好" }, (text) => text.length);
// Record<string, number>
```

`V` 从第一个参数推断为 `string`，于是回调的参数 `text` 也是 `string`（不需要标注）；`R` 从回调的返回值推断为 `number`。

## 约束：`extends`

在泛型函数内部，TypeScript 对 `T` 一无所知，所以 `T` 上的任何属性都不能访问。如果需要 `T` 至少具备某些成员，用 `extends` 加 **约束**：

```ts
interface HasId {
  id: string;
}

function indexById<T extends HasId>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item])); // 有了约束，才能访问 item.id
}

const calls = indexById([
  { id: "call_1", name: "get_weather" },
  { id: "call_2", name: "search" },
]);
calls.get("call_2")?.name; // ✅ Map<string, { id: string; name: string }>
```

`T extends HasId` 读作"`T` 必须能赋值给 `HasId`"，也就是"至少有一个 `string` 类型的 `id`"。不满足约束的调用会当场报错。

为什么不直接把参数写成 `readonly HasId[]`？因为那样返回的就是 `Map<string, HasId>`，调用方再读 `.name` 就会报错。**约束限制了输入，泛型保留了输入的具体类型**，两者配合，才能既能在函数内部用 `id`，又不丢掉调用方的其他字段。

## 泛型类型

`interface` 和 `type` 也可以有类型参数。类型参数还可以有 **默认值**：

```ts
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

const good: Result<number> = { ok: true, value: 42 }; // E 使用默认值 Error
const bad: Result<number, string> = { ok: false, error: "timeout" };
```

`Result` 是 agent 代码里非常有用的类型：工具执行可能成功也可能失败，与其抛异常，不如把"失败"作为返回值的一部分，让调用方必须处理。本节的练习就是实现它。

其实你早就在用泛型类型了：`string[]` 就是 `Array<string>` 的简写，`Map<K, V>`、`Record<K, V>`，以及第 3 章的 `Promise<T>`，都是泛型类型。

## 写好泛型的两条经验

### 1. 类型参数要能从参数推断出来

```ts
function emptyList<T>(): T[] {
  return [];
}
const mystery = emptyList(); // unknown[]
```

`T` 没有出现在任何参数里，TypeScript 没有线索，只能推断为 `unknown`。这种签名迫使调用方每次都手动写 `<T>`。

### 2. 类型参数至少要出现两次

泛型的作用是 **把输入和输出的类型联系起来**。如果一个类型参数只出现一次，它就没有联系任何东西，通常是一个伪装起来的类型断言：

```ts
function parseJson<T>(text: string): T {
  return JSON.parse(text); // JSON.parse 返回 any，所以这里不报错
}

const parsed = parseJson<{ city: string }>('{"town": "北京"}');
parsed.city; // 类型说是 string，实际是 undefined
```

这个函数看起来"类型安全"，其实和 `JSON.parse(text) as { city: string }` 一模一样：TypeScript 不会在运行时检查任何东西。外部数据应该返回 `unknown`，再校验（[1.7 节](../01-basics/07-any-unknown-never.md)）。第 5 章会用 schema 把"校验"和"类型"合二为一。

## 控制推断的两个工具

### `const` 类型参数：保留字面量类型

默认情况下，从数组、对象推断出的类型会被拓宽，`["search", "read_file"]` 推断为 `string[]`。在类型参数前加 `const`，TypeScript 会像对待 `as const` 一样推断出最精确的类型：

```ts
function toolNames<const T extends readonly string[]>(names: T): T {
  return names;
}
const exact = toolNames(["search", "read_file"]); // readonly ["search", "read_file"]
```

调用方不需要写 `as const`，就能得到字面量类型。章末项目的 `defineTool` 就靠它记住每个工具的名字。约束最好写成 `readonly string[]`，否则调用方传入一个已经 `as const` 过的只读数组时会报错：只读数组不能赋值给可变的 `string[]`。

### `NoInfer<T>`：别从这个参数推断

```ts
function pickModel<M extends string>(models: readonly M[], fallback: M): M {
  return models[0] ?? fallback;
}
pickModel(["gpt-5", "claude"], "gemini"); // 不报错：M 被推断成 "gpt-5" | "claude" | "gemini"
```

本意是"`fallback` 必须是 `models` 里的一个"，但 TypeScript 会综合所有参数来推断 `M`，`"gemini"` 也被算了进去。用内置的 `NoInfer<M>` 包住某个参数，告诉 TypeScript 只从其他参数推断：

```ts
function pickModelStrict<M extends string>(models: readonly M[], fallback: NoInfer<M>): M {
  return models[0] ?? fallback;
}
pickModelStrict(["gpt-5", "claude"], "gemini");
// ❌ Argument of type '"gemini"' is not assignable to parameter of type '"claude" | "gpt-5"'.
```

> 错误信息里联合类型成员的顺序可能和你写的不同，这不影响含义：`"claude" | "gpt-5"` 和 `"gpt-5" | "claude"` 是同一个类型。

## 小结

- 泛型让一段代码适用于多种类型，同时保留输入和输出之间的类型关系
- 调用泛型函数时，类型参数通常由 TypeScript 从实参推断，不需要手写
- `T extends 约束` 限制 `T` 至少要有什么；约束限制输入，泛型保留具体类型
- 类型参数要能从参数推断，并且至少出现两次；只出现在返回值里的类型参数是伪装的 `as`
- `const T` 保留字面量类型；`NoInfer<T>` 阻止从某个参数推断

## 练习

[exercises/02-advanced-types/01-result.ts](../../exercises/02-advanced-types/01-result.ts)：实现 `Result` 类型和一组处理它的泛型函数。运行 `pnpm ex 01-result`。

这是本章第一道 **类型练习**：除了运行时测试（`01-result.test.ts`），还有类型测试（`01-result.test-d.ts`），检查你写的签名推断出的类型对不对。类型测试不会运行，而是交给 `tsc` 检查，失败时的输出见 [2.8 节](08-debugging-type-errors.md#读懂类型测试的失败信息)。

下一节：[2.2 keyof、typeof 与索引访问类型](02-keyof-and-indexed-access.md)
