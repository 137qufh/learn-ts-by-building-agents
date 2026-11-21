# 1.3 数组与元组

> 这一节要解决的问题：对话历史是消息的列表，模型 ID 可以拆成"供应商 + 模型名"两部分。怎么描述"一组同类的东西"和"固定的几个东西"？

示例代码：[examples/03-arrays-and-tuples.ts](examples/03-arrays-and-tuples.ts)

## 数组

两种写法完全等价：

```ts
const models: string[] = ["gpt-5", "claude-sonnet"];
const scores: Array<number> = [0.9, 0.75];
```

本课程统一用 `T[]` 的写法。只有元素类型比较复杂时才需要加括号：`(string | undefined)[]`。

数组的元素类型会被检查：`models.push(42)` 会报错。空数组要写类型，否则 TypeScript 不知道将来会放什么进去：

```ts
const history: string[] = [];
```

## 下标访问可能越界

在 JavaScript 里，访问不存在的下标不会抛错，而是返回 `undefined`：

```ts
models[10]; // undefined
```

默认情况下 TypeScript 假装这件事不会发生，`models[10]` 的类型是 `string`。本仓库开启了 `noUncheckedIndexedAccess`，让类型说实话：

```ts
const first = models[0]; // string | undefined
first.toUpperCase(); // ❌ 'first' is possibly 'undefined'.

if (first !== undefined) {
  first.toUpperCase(); // ✅ 检查之后，TypeScript 知道它是 string
}
```

`if` 检查之后类型就从 `string | undefined` 变成了 `string`，这叫 **类型收窄**，[1.6 节](06-unions-and-narrowing.md) 会系统讲解。

这个选项一开始可能显得啰嗦，但实践中你会发现，大多数时候根本不需要按下标访问：

```ts
for (const model of models) {
  model.length; // model 就是 string，不带 undefined
}

const upper = models.map((m) => m.toUpperCase()); // string[]
const claude = models.find((m) => m.startsWith("claude")); // string | undefined：可能找不到
const last = models.at(-1); // 取最后一个元素，string | undefined
```

**优先用 `for...of` 和数组方法**，下标访问留给真正需要的场景。在那些场景里，`undefined` 检查往往正是你应该写却容易忘写的代码。

### filter 会自动收窄

```ts
const maybe: (string | undefined)[] = ["a", undefined, "b"];
const defined = maybe.filter((x) => x !== undefined); // string[]
```

从 TypeScript 5.5 开始，像 `x => x !== undefined` 这样简单的判断函数会被自动识别，`filter` 的结果直接就是 `string[]`。在更早的版本里你会看到很多手写的类型守卫，1.6 节会讲那种写法。

## 只读数组

```ts
function lastMessage(messages: readonly string[]): string | undefined {
  messages.push("偷偷加一条"); // ❌ Property 'push' does not exist on type 'readonly string[]'.
  return messages.at(-1);
}
```

`readonly string[]` 去掉了所有会修改数组的方法（`push`、`pop`、`splice`、`sort` 等）。

- 函数参数写成 `readonly T[]`，等于向调用方承诺"我不会改你的数组"。普通数组可以直接传进来
- 反过来不行：`readonly string[]` 不能赋值给 `string[]`，否则就能绕过只读限制了

**经验法则**：函数只读取数组时，参数类型就写 `readonly T[]`。对于 agent 来说，对话历史就是这样一种数据：很多函数要读它，但只有少数地方应该往里追加消息。

> 和对象的 `readonly` 一样，这只在编译期起作用。需要运行时也不可修改，用 `Object.freeze()`。

## 元组

**元组（tuple）** 是长度固定、每个位置类型固定的数组：

```ts
const entry: [string, number] = ["gpt-5", 1.25];
const [modelName, price] = entry; // 解构：modelName 是 string，price 是 number
```

可以给每个位置加上标签，提高可读性（标签只用于编辑器提示，不影响类型）：

```ts
type ModelId = [provider: string, model: string];
```

还可以有可选元素：`type Range = [start: number, end?: number]`。

元组最常见的用途是 **让函数返回多个值**，就像 Python 里返回 tuple 一样。React 的 `const [state, setState] = useState()` 就是一个著名的例子。

**什么时候用元组，什么时候用对象？** 元组的各个位置没有名字，只靠顺序区分。两三个元素、含义一目了然时用元组；元素再多，或者含义需要解释时，用对象：

```ts
// 好懂：
function splitModelId(id: string): [provider: string, model: string];
// 难懂：第三个 number 是什么？
function parse(id: string): [string, string, number, boolean];
```

## `as const`

数组字面量默认被推断为可变的普通数组：

```ts
const mutableRoles = ["user", "assistant"]; // string[]
```

在后面加上 `as const`，TypeScript 会推断出最精确的类型：一个只读元组，每个元素都是字面量类型：

```ts
const roles = ["user", "assistant"] as const; // readonly ["user", "assistant"]
```

这看起来只是个小技巧，但它是 [1.5 节](05-literal-types.md) 一个重要模式的基础：从一个运行时的数组推导出类型，让两者永远保持同步。

## 小结

- 数组写作 `T[]`；空数组需要标注类型
- `noUncheckedIndexedAccess` 让 `arr[i]` 的类型带上 `| undefined`；优先用 `for...of` 和数组方法，避免下标访问
- 函数只读取数组时，参数写成 `readonly T[]`
- 元组用于固定的少量元素，最常见于函数返回多个值；元素多了就换成对象
- `as const` 把数组字面量推断为只读的字面量元组

## 练习

[exercises/01-basics/02-model-id.ts](../../exercises/01-basics/02-model-id.ts)：解析模型 ID、处理消息列表。运行 `pnpm ex 02-model-id`。

下一节：[1.4 函数](04-functions.md)
