# 1.8 严格模式

> 这一节要解决的问题：`tsconfig.json` 里那些 `strict`、`noUnchecked...` 选项到底帮你拦住了什么？以后遇到看不懂的类型错误，该怎么读？

示例代码：[examples/08-strictness.ts](examples/08-strictness.ts)

前面几节其实已经一路在享受严格模式的保护了。这一节把它们集中梳理一遍：每个选项拦住的是哪一类真实的 bug。示例文件里每个选项都有一个会报错的例子，你可以临时关掉某个选项，运行 `pnpm typecheck` 看看错误消失。

## `strict` 包含什么

`strict: true` 是一个总开关，TypeScript 7 中它打开了下面这些检查：

| 选项                           | 拦住什么                                                | 本章出处 |
| ------------------------------ | ------------------------------------------------------- | -------- |
| `noImplicitAny`                | 参数没写类型时悄悄变成 `any`                            | 1.1、1.7 |
| `strictNullChecks`             | 把可能是 `null` / `undefined` 的值当成正常值使用        | 1.1、1.6 |
| `strictFunctionTypes`          | 把"处理不了所有输入"的函数传给需要它处理所有输入的地方  | 本节     |
| `useUnknownInCatchVariables`   | 假设 `catch` 到的一定是 `Error`                         | 1.7      |
| `strictPropertyInitialization` | 类的属性声明了却没有初始化                              | 本节     |
| `strictBindCallApply`          | `fn.call()` / `fn.apply()` / `fn.bind()` 的参数类型错误 | —        |
| `noImplicitThis`               | `this` 的类型不明确                                     | —        |
| `strictBuiltinIteratorReturn`  | 内置迭代器的返回值被当作 `any`                          | —        |

另外，`alwaysStrict`（以 JavaScript 严格模式解析代码）在 TypeScript 7 中已经无法关闭。

其中最重要的两个是 `noImplicitAny` 和 `strictNullChecks`。

### `noImplicitAny`

```ts
function shout(text) {
  // ❌ Parameter 'text' implicitly has an 'any' type.
  return text.toUpperCase();
}
```

没有这个选项，`text` 会被悄悄当成 `any`，整个函数失去类型检查，而你可能根本没意识到。

### `strictNullChecks`

```ts
function findUser(id: number): string | undefined { ... }

const user = findUser(id);
user.toUpperCase(); // ❌ 'user' is possibly 'undefined'.
```

没有这个选项，`null` 和 `undefined` 可以赋值给任何类型，`string` 实际上意味着"string 或者空"，于是"找不到用户"这种情况只能等到运行时以 `Cannot read properties of undefined` 的形式出现。`null` 引用被它的发明者称为"十亿美元的错误"，`strictNullChecks` 在编译期消灭了这一大类 bug。

### `strictFunctionTypes`

```ts
type Handler = (input: string | number) => void;
const handleStringOnly = (input: string) => console.log(input.toUpperCase());

const handler: Handler = handleStringOnly; // ❌
```

`Handler` 承诺可以处理 `string | number`，调用方可能会传入 `42`。而 `handleStringOnly` 只能处理字符串，收到 `42` 就会在 `toUpperCase` 处崩溃。所以不能把它当作 `Handler` 使用。

直觉上的规则：**一个函数要替代另一个函数，它必须能接住对方能接住的所有输入**。这背后的理论（逆变）第 2 章会讲。在 agent 代码里，这条规则会保护你的事件处理器和工具执行器：注册一个只会处理文本事件的处理器去接收所有事件，编译器会拦下来。

### `strictPropertyInitialization`

类的每个属性都必须有初始值，或者在构造函数里被赋值，否则它在运行时就是 `undefined`，和声明的类型不符。我们会在后面的章节用到类时再细说。

## 本仓库额外开启的选项

这些选项不在 `strict` 里，但在追求质量的项目中越来越常见。

### `noUncheckedIndexedAccess`

`arr[i]` 和 `record[key]` 的类型带上 `| undefined`。1.3 节已经详细讲过：数组可能为空，键可能不存在，类型应该说实话。实践中用 `for...of`、数组方法、`Map` 可以避开绝大多数下标访问。

### `exactOptionalPropertyTypes`：可选不等于可以是 undefined

```ts
interface RequestOptions {
  temperature?: number;
}

const omitted: RequestOptions = {}; // ✅ 没有这个属性
const undefinedValue: RequestOptions = { temperature: undefined }; // ❌
```

不开启这个选项时，`temperature?: number` 等价于 `temperature?: number | undefined`，两种写法都能通过。开启后，`?` 只表示 **"这个属性可以不存在"**，而不表示"可以存在但值是 `undefined`"。

为什么要区分？因为这两种对象在运行时确实不一样：

```ts
"temperature" in {}; // false
"temperature" in { temperature: undefined }; // true
Object.keys({ temperature: undefined }); // ["temperature"]
JSON.stringify({ temperature: undefined }); // "{}"
```

对 agent 开发而言，这个区别很实际：

- 一些 API 和库会用 `in`、`Object.keys` 或者展开运算符来判断"你有没有传某个参数"，`{ temperature: undefined }` 可能会被当成"传了"，进而覆盖掉默认值
- 用 `{ ...defaults, ...overrides }` 合并配置时，`overrides` 里值为 `undefined` 的属性会 **覆盖** `defaults` 里的有效值

有条件地设置可选属性，惯用写法是展开一个可能为空的对象：

```ts
function buildOptions(temperature: number | undefined): RequestOptions {
  return { ...(temperature === undefined ? {} : { temperature }) };
}
```

如果某个属性确实需要允许显式的 `undefined`（比如表示"清除这个设置"），就把它写进类型里：`temperature?: number | undefined`。

这个选项偶尔会和一些第三方库的类型定义不太合拍。遇到时，先确认是不是自己代码的问题；确实是库的问题，再考虑在那一处做转换。

### `noImplicitReturns`

```ts
function sign(n: number): string | undefined {
  // ❌ Not all code paths return a value.
  if (n > 0) return "+";
  if (n < 0) return "-";
}
```

即使返回类型里包含了 `undefined`，也要求每条路径都显式 `return`。`n === 0` 时返回 `undefined` 是你的本意，还是忘了处理？显式写出 `return undefined` 才能让读代码的人确定。

### `noFallthroughCasesInSwitch`

```ts
switch (level) {
  case "high": // ❌ Fallthrough case in switch.
    score += 10; // 忘了 break
  case "low":
    score += 1;
    break;
}
```

`case` 末尾没有 `break` 或 `return` 时，会继续执行下一个 `case` 的代码。这几乎总是 bug。多个 `case` 共享同一段代码（中间没有任何语句）依然是允许的。

### `noImplicitOverride`

子类覆盖父类的方法时必须写 `override` 关键字，防止拼错方法名导致"以为覆盖了、其实新建了一个方法"。等到用类时再细说。

## 用 `@ts-expect-error`，不用 `@ts-ignore`

两者都能让下一行的类型错误消失。区别是：

- `// @ts-ignore`：无条件忽略下一行的错误
- `// @ts-expect-error`：**期望** 下一行有错误；如果没有错误，它本身会变成一个错误

后者更安全：当代码或类型定义改进、错误不复存在时，你会得到提醒，可以把这条注释删掉，而不是让它永远躺在那里，掩盖未来可能出现的新错误。本仓库的示例就是用它来"演示错误"的：如果哪天某个示例不再报错，`tsc` 会失败，提醒我们更新讲解。

在正式代码里，这两种注释都应该极少出现。真需要时，在同一行写清楚原因：

```ts
// @ts-expect-error -- 某某库的类型定义缺少 xxx 参数，见 issue #123
```

## 怎样读类型错误

TypeScript 的错误信息有时很长，因为它会逐层解释"为什么不兼容"：

```
error TS2375: Type '{ temperature: undefined; }' is not assignable to type 'RequestOptions'
with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the
target's properties.
  Types of property 'temperature' are incompatible.
    Type 'undefined' is not assignable to type 'number'.
```

读的方法：

1. **第一行说结论**：哪个类型不能赋值给哪个类型
2. **缩进的行逐层深入**：具体是哪个属性、哪个位置出了问题。**最后一行通常最具体**，直接指向根源
3. **`TS2375` 这样的编号**可以拿去搜索，能找到大量解释和讨论
4. 有时第一行还会给出建议（`Consider adding ...`、`Did you mean ...`），值得认真看

另外，在 VS Code 里把鼠标悬停在变量上查看它的类型，往往比读错误信息更快找到问题：实际类型和你以为的类型不一样，就是问题所在。

## 小结

- `strict` 一定要开；其中 `noImplicitAny` 和 `strictNullChecks` 拦住的 bug 最多
- `strictFunctionTypes`：替代函数必须能接住所有可能的输入
- 本仓库额外开启：`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noImplicitReturns`、`noFallthroughCasesInSwitch`、`noImplicitOverride`
- `exactOptionalPropertyTypes` 区分"没有这个属性"和"属性值是 `undefined`"；有条件地加属性用 `...(cond ? {} : { key })`
- 用 `@ts-expect-error` 而不是 `@ts-ignore`，并写明原因
- 读错误信息：第一行看结论，最后一行找根源

本节没有单独的练习：前面每一道练习都在这些选项下完成。接下来，用本章学到的所有东西完成章末项目。

下一节：[1.9 章末项目：聊天记录的类型模型](09-project-chat-transcript.md)
