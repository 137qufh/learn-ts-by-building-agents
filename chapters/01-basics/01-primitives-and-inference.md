# 1.1 基本类型与类型推断

> 这一节要解决的问题：怎么告诉 TypeScript 一个值是什么类型？哪些地方必须写类型，哪些地方可以交给 TS 自己推断？

示例代码：[examples/01-primitives-and-inference.ts](examples/01-primitives-and-inference.ts)

## 类型标注

在变量名、参数名后面写 `: 类型`：

```ts
const model: string = "gpt-5";
const temperature: number = 0.7;
const stream: boolean = true;
```

此后，TypeScript 会检查每一次使用是否符合声明：

```ts
let maxTokens: number = 1024;
maxTokens = "a lot"; // ❌ Type 'string' is not assignable to type 'number'.
```

`Type 'X' is not assignable to type 'Y'`（X 类型不能赋值给 Y 类型）是你以后最常见的错误信息，意思是"你给的东西和要求的不一样"。

## 基本类型

| 类型        | 例子                       | 说明                                                     |
| ----------- | -------------------------- | -------------------------------------------------------- |
| `string`    | `"hi"`、`'hi'`、`` `hi` `` | 三种引号都可以；反引号是模板字符串，可以插入 `${表达式}` |
| `number`    | `42`、`0.7`、`NaN`         | 只有一种数字类型，整数和小数不区分（都是 64 位浮点数）   |
| `boolean`   | `true`、`false`            |                                                          |
| `bigint`    | `2n ** 64n`                | 任意精度整数，很少用到                                   |
| `symbol`    | `Symbol("id")`             | 唯一标识符，很少用到                                     |
| `undefined` | `undefined`                | "没有值"                                                 |
| `null`      | `null`                     | "明确的空"                                               |

几点值得注意：

- **类型名都是小写。** 也存在大写的 `String`、`Number`，它们指的是 JavaScript 的包装对象，几乎永远不该出现在类型标注里
- **`number` 不区分整数和小数。** 如果写过 Python，`int` 和 `float` 在这里都是 `number`。所以 `0.1 + 0.2` 是 `0.30000000000000004`；要判断整数用 `Number.isInteger()`
- **`NaN` 也是 `number`。** `Number("abc")` 不会抛错，而是返回 `NaN`。类型系统帮不了你，需要自己检查（`Number.isNaN()`）

## `undefined` 和 `null`

JavaScript 有两个表示"没有"的值，这在其他语言里很少见：

- `undefined`：**没有值**。未赋值的变量、对象上不存在的属性、没有 `return` 的函数的返回值，都是 `undefined`
- `null`：**明确的空**。通常是程序员主动赋的值，JSON 里也只有 `null`

在 `strict` 模式下，`null` 和 `undefined` 都是独立的类型，不能赋值给 `string` 之类的类型：

```ts
const title: string = null; // ❌ Type 'null' is not assignable to type 'string'.
let nickname: string | null = null; // ✅ 明确说明"可能是 null"
```

`string | null` 读作"string 或 null"，这种类型叫 **联合类型**，[1.6 节](06-unions-and-narrowing.md) 会详细讲。这条规则帮你在编译期就消灭了"空指针异常"这一大类 bug：一个值可能为空时，类型会提醒你，在使用前先检查。

处理"可能为空"的值时，最常用的工具是 `??`（空值合并运算符）：左边是 `null` 或 `undefined` 时取右边的值，否则取左边：

```ts
function displayName(name: string | undefined): string {
  return name ?? "(匿名)"; // name 是 undefined 时返回 "(匿名)"
}
```

它和 `||` 很像，但有一个关键区别，[1.6 节](06-unions-and-narrowing.md) 会讲。

**本课程的约定**：表示"可能没有"时优先用 `undefined`（它和可选属性、可选参数是一套机制），只有在外部数据（如 JSON、某些 API）要求时才用 `null`。

## 类型推断

大部分时候你不需要写类型，TypeScript 会根据初始值推断：

```ts
let maxTokens = 1024; // 推断为 number
maxTokens = "a lot"; // ❌ 照样报错
```

在 VS Code 里把鼠标悬停在变量名上，就能看到推断出的类型。**多用这个功能**，它是学习 TypeScript 最快的方式之一。

### `let` 和 `const` 推断出的类型不一样

```ts
let provider = "openai"; // string
const role = "user"; // "user"
```

`let` 声明的变量以后可以改成别的字符串，所以 TS 推断为宽泛的 `string`。`const` 声明的变量永远不会变，所以 TS 推断为最精确的类型：只能是 `"user"` 这一个值的 **字面量类型**。这个区别在 [1.5 节](05-literal-types.md) 会变得很重要。

## 什么时候该写类型标注

经验法则：**在边界处写，在内部推断。**

1. **函数参数：必须写。** TS 无法从函数体推断调用者会传入什么（不写会报 `Parameter 'x' implicitly has an 'any' type`）
2. **导出函数的返回值：推荐写。** 返回类型是函数对外承诺的"合同"。写明以后，如果函数体改动导致返回了别的类型，错误会报在函数内部，而不是报在几十个调用方那里
3. **声明时没有初始值的变量：要写**，例如 `let lastError: string | undefined;`
4. **其余局部变量：不要写。** `const count: number = 0` 里的 `: number` 只是噪音

```ts
export function estimateCost(inputTokens: number, pricePerMillion: number): number {
  const millions = inputTokens / 1_000_000; // 局部变量：交给推断
  return millions * pricePerMillion;
}
```

> `export` 表示这个函数可以被其他文件 `import`。数字中的 `_` 是分隔符，只为方便阅读，`1_000_000` 就是 `1000000`。

## 小结

- 用 `: 类型` 标注；类型名是小写的 `string`、`number`、`boolean` 等
- `number` 不区分整数和小数；`NaN` 也是 `number`
- 严格模式下 `null` 和 `undefined` 是独立的类型，可能为空的值要写成 `string | undefined` 这样的联合类型
- 在边界（函数参数、导出函数的返回值）写类型，在内部交给推断
- 对于字符串、数字这样的基本类型值，`let` 推断出宽泛的类型，`const` 推断出字面量类型

练习：本节和下一节共用一道练习，见 [1.2 节末尾](02-objects-and-interfaces.md#练习)。

下一节：[1.2 对象类型、interface 与 type](02-objects-and-interfaces.md)
