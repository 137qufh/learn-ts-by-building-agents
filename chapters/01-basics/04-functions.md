# 1.4 函数

> 这一节要解决的问题：agent harness 本质上是一堆函数的组合：构造请求、解析响应、执行工具、重试失败的调用。怎么给函数的输入和输出写类型？怎么描述"一个函数"本身的类型？

示例代码：[examples/04-functions.ts](examples/04-functions.ts)

## 两种写法

```ts
// 函数声明
function add(a: number, b: number): number {
  return a + b;
}

// 箭头函数
const multiply = (a: number, b: number): number => a * b;
```

两种写法的类型标注方式一样：参数后面写类型，参数列表后面写返回类型。JavaScript 里它们在 `this` 的处理上有区别，但在不使用 `this` 的代码里（本课程绝大多数代码都是这样）可以互换。

**本课程的习惯**：模块顶层的具名函数用 `function` 声明，作为参数传递的回调用箭头函数。

TypeScript 会检查调用时的参数类型和 **个数**：`add(1)` 会报 `Expected 2 arguments, but got 1`。这一点和 JavaScript 不同，JS 会默默把缺少的参数当作 `undefined`。

## 返回类型：写还是不写

返回类型可以推断，但 1.1 节说过，**导出的函数建议显式写出返回类型**。看一个例子：

```ts
function parsePort(text: string): number {
  const port = Number(text);
  if (Number.isNaN(port)) return "invalid"; // ❌ Type 'string' is not assignable to type 'number'.
  return port;
}
```

如果没写 `: number`，TypeScript 会推断返回类型为 `string | number`，函数本身不报错，错误会出现在每一个把返回值当数字用的调用方那里，离真正的问题很远。写了返回类型，错误就报在出错的那一行。

## 可选参数、默认值、剩余参数

```ts
function truncate(text: string, maxLength = 20, suffix?: string): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + (suffix ?? "…");
}

truncate("..."); // ✅
truncate("...", 10); // ✅
truncate("...", 10, "..."); // ✅
```

- **默认值** `maxLength = 20`：类型从默认值推断为 `number`，调用时可以省略
- **可选参数** `suffix?: string`：在函数内部的类型是 `string | undefined`。可选参数必须放在必需参数后面
- **剩余参数** `...lines: string[]`：把任意多个参数收集成一个数组

## 参数多了，用选项对象

当一个函数有好几个可选参数时，按位置传参很快就会失控：`complete(prompt, undefined, undefined, 0.2)`，谁也看不出 `0.2` 是什么。主流的 JS/TS 库（包括各家模型的 SDK）都用 **选项对象** 来解决这个问题：

```ts
interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

function describeRequest(prompt: string, options: CompletionOptions = {}): string {
  const { model = "gpt-5", temperature = 1, maxTokens = 1024 } = options;
  return `${model} (t=${temperature}, max=${maxTokens}): ${prompt}`;
}

describeRequest("讲个笑话", { temperature: 0 });
```

`const { model = "gpt-5", ... } = options` 是 **解构赋值**：从对象里取出同名属性，属性为 `undefined` 时使用默认值。参数本身的 `= {}` 让调用方可以完全省略第二个参数。

选项对象还有一个好处：多余属性检查依然有效。`describeRequest("hi", { maxToken: 10 })` 会当场报错，并提示你是不是想写 `maxTokens`。

> 这有点像 Python 的关键字参数（keyword arguments）。JavaScript 没有这种语法，选项对象就是社区的惯用替代方案。

## 函数类型

函数也是值，可以存进变量、作为参数传递。描述"一个函数"的类型用箭头语法：

```ts
type Transform = (text: string) => string;
```

读作"接收一个 string 参数、返回 string 的函数"。参数名 `text` 只是为了可读性，不影响兼容性。

```ts
const shout: Transform = (text) => text.toUpperCase(); // text 不用写类型

function pipeline(text: string, steps: readonly Transform[]): string {
  let result = text;
  for (const step of steps) result = step(result);
  return result;
}

pipeline("  hello agent  ", [trim, shout]); // "HELLO AGENT"
```

注意 `shout` 的参数 `text` 没有写类型，TypeScript 却知道它是 `string`。这叫 **上下文类型（contextual typing）**：函数被放在一个已知类型的位置上，参数类型就从那个位置推断出来。最常见的场景是数组方法的回调：

```ts
["a", "bb"].map((s) => s.length); // s 自动是 string
```

所以 **回调函数的参数几乎从不需要写类型**。

## `void`：不关心返回值

```ts
function log(message: string): void {
  console.log(message);
}
```

`void` 表示"这个函数的返回值没有意义，不要使用它"。

一个容易让人意外的规则：类型为 `() => void` 的位置，可以放一个 **有返回值** 的函数：

```ts
type Callback = () => void;
const callback: Callback = () => 42; // ✅
```

这是刻意的设计。比如 `items.forEach((x) => result.push(x))`：`forEach` 期望回调返回 `void`，而 `push` 返回新的数组长度。如果这样写都报错，会非常烦人。"返回 `void`"的真正含义是"调用方会忽略返回值"，而不是"必须什么都不返回"。

## 函数可以返回函数

```ts
function makeCounter(start = 0): () => number {
  let count = start;
  return () => {
    count += 1;
    return count;
  };
}

const next = makeCounter();
next(); // 1
next(); // 2
```

返回的箭头函数"记住"了外层的 `count` 变量，这叫 **闭包**。后面写 harness 时，我们会用这种方式创建带有内部状态的工具函数（比如带计数的限流器）。

## 函数重载（了解即可）

TypeScript 允许为一个函数声明多个调用签名，叫 **重载（overload）**。它主要用在"返回类型取决于参数类型"的场景，比如很多库的 API 定义里。在自己的代码里，联合类型参数（1.6 节）或泛型（第 2 章）通常是更简单的选择，所以本章不展开。读库的类型定义时看到同名函数的多个签名，知道这是重载就好。

## 小结

- 参数必须写类型；导出函数的返回类型建议显式写出，让错误报在正确的位置
- 可选参数 `x?: T`、默认值 `x = value`、剩余参数 `...xs: T[]`
- 可选参数多时，用选项对象 + 解构默认值
- 函数类型写作 `(param: T) => R`；回调函数的参数类型靠上下文推断，不用写
- `() => void` 的意思是"返回值会被忽略"，而不是"必须不返回"

## 练习

[exercises/01-basics/03-backoff.ts](../../exercises/01-basics/03-backoff.ts)：实现重试的退避时间计算和一个文本处理管道。运行 `pnpm ex 03-backoff`。

下一节：[1.5 字面量类型](05-literal-types.md)
