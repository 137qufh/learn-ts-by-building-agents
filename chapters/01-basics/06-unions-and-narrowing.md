# 1.6 联合类型与类型收窄

> 这一节要解决的问题：模型的一次输出可能是一段文字，也可能是一个工具调用，还可能是一个错误。一个值有好几种可能的形状时，怎么描述它？又怎么在代码里安全地分情况处理？

示例代码：[examples/06-unions-and-narrowing.ts](examples/06-unions-and-narrowing.ts)

这是本章最重要的一节。**可辨识联合 + 类型收窄** 是用 TypeScript 写 agent 的核心模式：消息、内容块、流式事件、工具结果，全都是用它来建模的。

## 联合类型

`A | B` 表示"A 或者 B"。前面已经见过很多次：`string | undefined`、`"user" | "assistant"`。

拿到一个联合类型的值时，你只能使用 **所有成员都有** 的东西：

```ts
function lengthOf(content: string | string[]): number {
  return content.length; // ✅ string 和 string[] 都有 length
}

function shout(content: string | string[]): string {
  return content.toUpperCase(); // ❌ Property 'toUpperCase' does not exist on type 'string | string[]'.
}
```

这很合理：如果 `content` 实际上是数组，调用 `toUpperCase` 会在运行时崩溃。要用某个成员特有的东西，必须先 **证明** 它就是那个成员。

## 类型收窄

TypeScript 会跟踪你的代码逻辑。在 `if` 判断之后，它知道值在这个分支里只可能是哪几种类型，这叫 **类型收窄（narrowing）**：

```ts
function formatValue(value: string | number | boolean): string {
  if (typeof value === "string") {
    return `"${value}"`; // value: string
  }
  if (typeof value === "number") {
    return value.toFixed(2); // value: number
  }
  return value ? "yes" : "no"; // value: boolean
}
```

注意最后一行：前两个分支都 `return` 了，所以走到这里的只可能是 `boolean`。TypeScript 的这种能力叫 **控制流分析**，它理解 `return`、`throw`、`break`、`continue` 对后续代码的影响。所以"先排除特殊情况，提前返回"的写法在 TS 里格外好用。

下面是所有常用的收窄方式。

### `typeof`

适用于基本类型。`typeof x` 的结果是这些字符串之一：`"string"`、`"number"`、`"boolean"`、`"bigint"`、`"symbol"`、`"undefined"`、`"object"`、`"function"`。

小心一个 JavaScript 的历史遗留问题：**`typeof null` 是 `"object"`**，数组的 `typeof` 也是 `"object"`。所以 `typeof x === "object"` 并不能保证 `x` 是一个普通对象。

### `Array.isArray`

区分数组和非数组：

```ts
function toText(content: string | string[]): string {
  return Array.isArray(content) ? content.join("\n") : content;
}
```

### 相等判断

`===`、`!==` 可以收窄到具体的值，最常见的是排除 `undefined` 或 `null`：

```ts
if (maxTokens !== undefined) {
  // maxTokens: number
}
```

`x == null`（两个等号）是一个惯用法：它同时匹配 `null` 和 `undefined`，且只匹配这两个值。除此之外，本课程一律使用 `===`。

### 真值判断及其陷阱

`if (x)` 会排除所有 **假值（falsy）**。JavaScript 的假值一共只有这几个：

```
false   0   -0   0n   ""   null   undefined   NaN
```

用 `if (name)` 排除 `undefined` 很方便，但它 **同时排除了 `""` 和 `0`**，这常常不是你想要的：

```ts
function describeLimit(maxTokens: number | undefined): string {
  if (!maxTokens) return "不限制"; // ❗ maxTokens 为 0 时也会走到这里
  return `最多 ${maxTokens}`;
}
```

**经验法则**：值的类型是 `string` 或 `number` 时，不要用真值判断来检查"有没有值"，明确写出 `=== undefined`。

### `??` 和 `||`

1.1 节简单介绍过 `??`。它和 `||` 的区别正是上面那个陷阱：

```ts
const temperature = 0;
temperature || 1; // 1 —— || 在左边是"任何假值"时取右边
temperature ?? 1; // 0 —— ?? 只在左边是 null 或 undefined 时取右边
```

温度为 0、重试次数为 0、空字符串的系统提示词，这些都是合法的值。**提供默认值时用 `??`**。

### `?.` 可选链

```ts
response.usage?.inputTokens; // usage 是 undefined 时，整个表达式就是 undefined，不会报错
response.usage?.inputTokens ?? 0; // 常和 ?? 一起使用
```

`a?.b` 在 `a` 为 `null` 或 `undefined` 时直接返回 `undefined`，否则才访问 `.b`。也可以用在方法调用 `a?.method()` 和下标访问 `a?.[0]` 上。

### `in`

检查对象是否有某个属性：

```ts
function describeBlock(block: TextBlock | ImageBlock): string {
  if ("text" in block) {
    return `文本：${block.text}`; // block: TextBlock
  }
  return `图片：${block.url}`; // block: ImageBlock
}
```

### `instanceof`

检查一个对象是否由某个类创建，最常用于错误处理：

```ts
error instanceof Error ? error.message : String(error);
```

## 可辨识联合

上面的 `in` 判断能用，但不够好：如果两种块都有 `text` 属性呢？更可靠的做法是给每个成员加一个 **字面量类型的标签字段**：

```ts
type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "error"; message: string };
```

每个成员都有 `type` 字段，而且值各不相同。这种结构叫 **可辨识联合（discriminated union）**，`type` 就是"辨识字段"。检查它就能精确收窄：

```ts
function render(event: AgentEvent): string {
  switch (event.type) {
    case "text":
      return event.text; // event: { type: "text"; text: string }
    case "tool_call":
      return `→ ${event.name}(${JSON.stringify(event.args)})`;
    case "error":
      return `✗ ${event.message}`;
  }
}
```

在每个 `case` 里，`event` 都被收窄成了对应的成员，编辑器也只会补全那个成员的属性。

这个函数没有 `default` 分支，也没有在最后写 `return`，却没有报"缺少返回值"的错误。因为 TypeScript 知道三种情况已经全部覆盖，`switch` 之后的代码不可能被执行到。

你会在各家模型 API 的类型定义里反复看到这个模式：

- 消息用 `role` 区分：`"system" | "user" | "assistant" | "tool"`
- 内容块用 `type` 区分：`"text" | "image" | "tool_use" | "tool_result"`
- 流式事件用 `type` 区分：`"message_start" | "content_block_delta" | ...`

辨识字段叫什么都可以（`type`、`kind`、`role`），关键是 **每个成员上都有、类型是不同的字面量**。

> 来自 Python 的话，可以把它类比成带 `Literal` 标签字段的 `TypedDict` 联合，配合 `match` 语句使用。来自 Rust / Swift 的话，它就是 TS 版的带数据的枚举（ADT）。

## 穷尽性检查

上面的 `render` 很好，但还不够安全。假如以后给 `AgentEvent` 加了一种 `"thinking"` 事件，而 `render` 恰好有 `default` 分支（或者函数返回 `void`，不需要每条路径都返回值），TypeScript 就不会提醒你漏处理了。

解决方法是 **穷尽性检查（exhaustiveness checking）**：

```ts
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
      return assertNever(event);
  }
}
```

原理：每处理一个 `case`，TypeScript 就从 `event` 的类型里排除一个成员。所有成员都处理完之后，`default` 分支里 `event` 的类型就是 `never`（"不可能存在的值"，下一节详细讲）。`assertNever` 只接受 `never`，所以：

- 全部处理了：`event` 是 `never`，类型检查通过
- 漏了一种：`event` 是被漏掉的那个成员，**编译报错**，并指出漏掉的是哪一个

```ts
// 漏了 "square"：
return assertNever(shape);
// ❌ Argument of type '{ kind: "square"; side: number; }' is not assignable to parameter of type 'never'.
```

运行时的 `throw` 是第二道保险：万一来了类型系统之外的数据（比如 API 新增了一种事件类型），程序会明确报错，而不是悄悄地做错事。

**在 agent 代码里，凡是对可辨识联合做 `switch`，都应该加上穷尽性检查。** API 会演进，新的事件类型会出现，你希望编译器告诉你所有需要修改的地方。

## 自定义类型守卫

有时判断逻辑比较复杂，或者需要在多处复用。可以把它写成一个返回 `value is 类型` 的函数，叫 **类型守卫（type guard）**：

```ts
type ToolCallEvent = Extract<AgentEvent, { type: "tool_call" }>;

function isToolCall(event: AgentEvent): event is ToolCallEvent {
  return event.type === "tool_call";
}

if (isToolCall(event)) {
  event.name; // event: ToolCallEvent
}
const calls = events.filter(isToolCall); // ToolCallEvent[]
```

`Extract<联合, 条件>` 从联合类型里挑出符合条件的成员，这是 TypeScript 内置的工具类型，第 2 章会讲它是怎么实现的。

返回类型 `event is ToolCallEvent` 是对 TypeScript 的承诺："返回 `true` 时，参数就是这个类型"。**TypeScript 不会验证这个承诺**：如果函数体写错了，类型就会和实际不符。所以守卫函数要写得简单、并且有测试。

> 从 TypeScript 5.5 开始，像 `events.filter((e) => e.type === "tool_call")` 这样简单的判断会被自动推断为类型守卫，结果直接就是 `ToolCallEvent[]`。判断逻辑复杂、或者需要复用时，显式的守卫函数依然有用。

## 小结

- 联合类型 `A | B` 的值只能使用共有的成员；要用特有成员，先收窄
- 收窄方式：`typeof`、`Array.isArray`、`===`、真值判断、`in`、`instanceof`、自定义守卫
- 真值判断会排除 `0` 和 `""`；提供默认值时用 `??` 而不是 `||`
- 可辨识联合：每个成员带一个不同的字面量标签，`switch` 标签即可精确收窄。这是 agent 代码的核心建模方式
- 对可辨识联合做 `switch` 时加上 `assertNever` 穷尽性检查

## 练习

[exercises/01-basics/05-content-parts.ts](../../exercises/01-basics/05-content-parts.ts)：处理多种类型的消息内容块。运行 `pnpm ex 05-content-parts`。

下一节：[1.7 any、unknown 与 never](07-any-unknown-never.md)
