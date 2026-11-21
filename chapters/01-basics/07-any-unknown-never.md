# 1.7 any、unknown 与 never

> 这一节要解决的问题：模型返回的 JSON、API 的响应体、`catch` 到的错误，这些值的类型事先都不知道。该用什么类型表示"不知道"？还有那个出现在穷尽性检查里的 `never` 到底是什么？

示例代码：[examples/07-any-unknown-never.ts](examples/07-any-unknown-never.ts)

## 先看全貌

可以把类型想象成"值的集合"：`string` 是所有字符串的集合，`"user"` 是只有一个元素的集合，`"user" | "assistant"` 是两个元素的集合。在这个视角下：

| 类型      | 集合                               | 赋值规则                                           |
| --------- | ---------------------------------- | -------------------------------------------------- |
| `unknown` | 所有值（全集）                     | 任何值都能赋给它；它不能直接赋给别的类型，需先收窄 |
| `never`   | 没有任何值（空集）                 | 它能赋给任何类型；没有任何值能赋给它               |
| `any`     | 不是集合，而是"关闭类型检查"的开关 | 任何值都能赋给它，它也能赋给任何类型               |

`unknown` 和 `never` 是类型系统里合法的两端；`any` 是一个逃生舱口，它让 TypeScript 在这个值上 **放弃检查**。

## any：关闭类型检查

```ts
const anything: any = JSON.parse('{"text": "hi"}');

anything.foo.bar(); // ✅ 编译通过，运行时崩溃
const n: number = anything; // ✅ 编译通过，但 n 实际上是个对象
```

`any` 类型的值可以做任何操作、赋给任何类型，TypeScript 一概不管。更糟糕的是它会 **传染**：从 `any` 上取到的属性、调用的返回值，也全都是 `any`。一个 `any` 进入代码，可能悄悄让一大片代码失去类型保护。

`any` 从哪里来？

- **你自己写的** `: any`：本课程中不会出现
- **`JSON.parse()`** 的返回值
- **很多库里"解析外部数据"的 API**。例如浏览器 DOM 类型里 `fetch` 响应的 `response.json()` 返回 `Promise<any>`（本仓库只用 Node.js 的类型，那里它返回的是更安全的 `Promise<unknown>`，第 3 章会用到）
- **没有类型定义的第三方库**（现在已经很少见了）
- **隐式 any**：参数没写类型时。`strict` 模式（`noImplicitAny`）会把它变成错误

解析外部数据恰恰是 agent 程序里最常见的操作。所以要养成习惯：**拿到 `any`，立刻把它变成 `unknown`**。

## unknown：类型安全的"不知道"

```ts
const data: unknown = JSON.parse('{"text": "hi"}');
data.text; // ❌ 'data' is of type 'unknown'.
```

`unknown` 同样能接收任何值，但在你 **证明** 它是什么之前，不允许对它做任何操作。证明的方法就是上一节学的类型收窄：

```ts
function readText(value: unknown): string | undefined {
  if (typeof value === "object" && value !== null && "text" in value) {
    return typeof value.text === "string" ? value.text : undefined;
  }
  return undefined;
}
```

逐步拆解：

1. `typeof value === "object"`：排除字符串、数字等基本类型。但 `null` 的 `typeof` 也是 `"object"`（1.6 节）
2. `value !== null`：所以还要排除 `null`。到这里 `value` 的类型是 `object`
3. `"text" in value`：确认有 `text` 属性。到这里 `value.text` 可以访问了，但它的类型仍然是 `unknown`
4. `typeof value.text === "string"`：最后确认 `text` 是字符串

是的，手写校验很繁琐。这正是第 5 章要介绍 Zod 的原因：用一行 schema 描述期望的结构，自动完成校验并得到正确的类型。但在那之前，你需要理解它背后做的就是这些事。

**经验法则**：

- 函数要接收"任何东西"时，参数类型写 `unknown`，而不是 `any`
- 外部数据（JSON、API 响应、模型输出、用户输入）先当作 `unknown`，校验后再使用

## catch 到的错误是 unknown

```ts
try {
  callModel();
} catch (error) {
  error.message; // ❌ 'error' is of type 'unknown'.
}
```

JavaScript 允许 `throw` 任何值：`throw "字符串"`、`throw 42`、`throw { code: 1 }` 都是合法的。所以 TypeScript 无法保证 `catch` 到的一定是 `Error`。在 `strict` 模式下（具体是 `useUnknownInCatchVariables` 选项），`catch` 的变量类型是 `unknown`，必须先检查：

```ts
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
}
```

agent 程序要和网络、外部工具打交道，错误处理无处不在。练习里你会写一个通用的 `getErrorMessage(error: unknown)` 函数，后面的章节会一直用到它。

## never：不可能存在的值

`never` 是空集，没有任何值属于它。它在三种场景下出现：

**1. 永远不会正常返回的函数**

```ts
function fail(message: string): never {
  throw new Error(message);
}
```

总是抛出异常（或者无限循环）的函数，返回类型是 `never`。TypeScript 的控制流分析会利用这一点：调用 `fail()` 之后的代码被认为不可达，所以它可以像 `return` 一样帮助收窄。本仓库练习里的 `todo()` 就是一个返回 `never` 的函数，这也是为什么它能放在任何需要返回值的地方。

**2. 收窄到穷尽之后**

1.6 节的穷尽性检查：把联合类型的所有成员都排除之后，剩下的就是 `never`。

**3. 不可能满足的类型**

`string & number`：既是字符串又是数字的值不存在，所以是 `never`。1.2 节里 `&` 合并冲突属性时出现的 `never` 就是这么来的。

## 类型断言：`as` 和 `!`

有时你比 TypeScript 知道得更多，可以用 **类型断言** 告诉它"相信我"：

```ts
const usage = JSON.parse(body) as Usage;
```

但要清楚：**断言不做任何运行时检查**。它只是让编译器闭嘴。如果你说错了，错误会在运行时以奇怪的方式出现：

```ts
const asserted = JSON.parse('{"inputTokens": "oops"}') as Usage;
typeof asserted.inputTokens; // "string"，而类型说它是 number
```

TypeScript 只允许在"有可能兼容"的类型之间断言，`"42" as number` 会报错。如果你看到 `x as unknown as T` 这种"双重断言"，那是在强行绕过这个限制，基本可以确定是个坏味道。

**非空断言** `!` 是一种特殊的断言，表示"这个值一定不是 `null` 或 `undefined`"：

```ts
const firstModel = models[0]!; // string，而不是 string | undefined
```

### 什么时候可以用断言？

断言是逃生舱口，不是日常工具。合理的场景很少：

- **测试代码**里，你确切知道数据是什么
- 刚做完一个运行时检查，但 TypeScript **无法理解**这个检查（比如检查分散在两个函数里）
- 和类型定义不完善的外部库打交道

其他情况，优先用类型收窄。一个好的经验法则是：每写一个 `as` 或 `!`，都在旁边写一句注释解释"为什么我确定这是对的"。如果写不出来，那它很可能是错的。

## 小结

- `any` 关闭类型检查并且会传染；它常常来自 `JSON.parse` 这类解析外部数据的 API
- `unknown` 是类型安全的"不知道"：可以接收任何值，但使用前必须收窄。外部数据一律先当作 `unknown`
- `catch` 的变量是 `unknown`，用 `instanceof Error` 检查
- `never` 是空集：用于永不返回的函数、穷尽性检查和不可能的类型
- `as` 和 `!` 只是让编译器闭嘴，不做运行时检查；能用收窄就不用断言

## 练习

[exercises/01-basics/06-tool-arguments.ts](../../exercises/01-basics/06-tool-arguments.ts)：安全地解析工具参数、提取错误信息。运行 `pnpm ex 06-tool-arguments`。

下一节：[1.8 严格模式](08-strictness.md)
