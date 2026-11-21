# 2.4 条件类型

> 这一节要解决的问题：怎么让类型根据另一个类型"做选择"？比如从消息联合里挑出 `role` 是 `"tool"` 的那一种，或者找出配置里所有数值类型的字段。

示例代码：[examples/04-conditional-types.ts](examples/04-conditional-types.ts)

映射类型是类型层面的 `for` 循环，条件类型就是类型层面的 `if`。两者组合起来，再加上下一节的 `infer`，你就能读懂（以及写出）绝大多数库里看起来像天书的类型定义。

## 基本语法

```ts
type IsString<T> = T extends string ? true : false;

type A = IsString<"gpt-5">; // true
type B = IsString<42>; // false
```

`T extends U ? X : Y` 读作"如果 `T` 能赋值给 `U`，结果是 `X`，否则是 `Y`"。语法借用了 JavaScript 的三元运算符。

这里的 `extends` 和泛型约束里的 `extends` 是同一个意思：**能赋值给**。`"gpt-5" extends string` 成立，因为字面量类型 `"gpt-5"` 是 `string` 的一种；`string extends "gpt-5"` 则不成立。

## 分配：条件类型遇到联合

当被检查的类型是一个 **裸露的类型参数**（直接写 `T`，没有包在别的类型里），并且传进来的是联合时，条件类型会 **对联合的每个成员分别求值**，再把结果合并起来：

```ts
type C = IsString<"gpt-5" | 42>;
// = IsString<"gpt-5"> | IsString<42>
// = true | false
// = boolean
```

这叫 **分配式条件类型**（distributive conditional type）。它是条件类型最有用的特性，标准库里的 `Exclude` 和 `Extract` 都靠它实现：

```ts
type MyExclude<T, U> = T extends U ? never : T; // 删掉能赋值给 U 的成员
type MyExtract<T, U> = T extends U ? T : never; // 留下能赋值给 U 的成员

type Role = "system" | "user" | "assistant" | "tool";
type Speaker = MyExclude<Role, "system" | "tool">; // "user" | "assistant"
```

以 `MyExclude` 为例一步步展开：每个成员分别判断，`"system"` 和 `"tool"` 得到 `never`，`"user"` 和 `"assistant"` 得到它们自己。`never` 在联合里会消失（`X | never` 就是 `X`），于是只剩下 `"user" | "assistant"`。

去掉 `null` 和 `undefined` 也可以用同样的套路：`T extends null | undefined ? never : T`。早期版本的标准库里，`NonNullable<T>` 就是这样定义的；现在它改成了更简单的 `T & {}`，效果相同（`{}` 这个类型表示"除了 `null` 和 `undefined` 以外的任何值"）。

### 从可辨识联合里挑出成员

`Extract` 对 agent 代码特别有用：从消息联合里按 `role` 取出某一种。

```ts
type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

type MessageOfRole<R extends Message["role"]> = Extract<Message, { role: R }>;
type ToolMessage = MessageOfRole<"tool">; // { role: "tool"; toolCallId: string; content: string }
```

`{ role: "tool"; ... }` 能赋值给 `{ role: "tool" }`，其他成员不能，所以只留下了它。配合一个泛型的类型守卫，过滤结果就有了精确的类型：

```ts
function ofRole<R extends Message["role"]>(
  messages: readonly Message[],
  role: R,
): MessageOfRole<R>[] {
  return messages.filter((m): m is MessageOfRole<R> => m.role === role);
}

ofRole(history, "tool")[0]?.toolCallId; // ✅ 不需要再收窄
```

> 这个守卫里的 `m.role === role` 是一个 TypeScript 无法验证的承诺（见 [1.6 节](../01-basics/06-unions-and-narrowing.md#自定义类型守卫)）。守卫写对了，类型才是对的，所以要有测试。

### 阻止分配

有时候你需要把联合 **当成一个整体** 来判断。把 `extends` 两边都包进元组即可，这时 `T` 不再"裸露"，分配就不会发生：

```ts
type IsStringStrict<T> = [T] extends [string] ? true : false;
type D = IsStringStrict<"gpt-5" | 42>; // false：整个联合不能赋值给 string
```

最经典的例子是判断 `never`：

```ts
type IsNeverWrong<T> = T extends never ? true : false;
type E = IsNeverWrong<never>; // never ——而不是 true！

type IsNever<T> = [T] extends [never] ? true : false;
type F = IsNever<never>; // true
```

`never` 可以看成"没有成员的联合"。分配是"对每个成员求值再合并"，没有成员，结果自然也是空的，也就是 `never`。这个陷阱迟早会遇到，[2.8 节](08-debugging-type-errors.md) 的练习里就有一个。

## 与映射类型配合

一个非常常见的组合：**找出值为某种类型的键**。

```ts
interface ChatSettings {
  model: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
}

type KeysOfType<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T];

type NumericSetting = KeysOfType<ChatSettings, number>; // "temperature" | "maxTokens"
```

分两步看：

1. 映射类型把每个属性的值换成"它的键名或者 `never`"：`{ model: never; temperature: "temperature"; maxTokens: "maxTokens"; stream: never }`
2. 末尾的 `[keyof T]` 取出所有值的联合（2.2 节的 `T[keyof T]`），`never` 消失，剩下的就是想要的键

有了它，就能写出"只接受数值字段"的函数，传入 `"model"` 会报错。

### 可选属性：混进来的 `undefined`

给设置加一个可选的数值字段，结果就变奇怪了：

```ts
interface SeededSettings extends ChatSettings {
  seed?: number;
}

type Loose = KeysOfType<SeededSettings, number>; // "temperature" | "maxTokens" | undefined
```

这里发生了两件事：

1. 可选属性 `seed` 的 `T[K]` 是 `number | undefined`（值可能不存在），它不能赋值给 `number`，所以映射成了 `never`。这其实是对的：一个"可能没有值"的字段，确实不该被当成数值字段来用
2. `[K in keyof T]` 是同态映射，**保留了 `?`**，中间结果是 `{ ...; seed?: never }`。读取一个可选属性，得到的类型要加上 `undefined`，于是 `never | undefined` 留下了 `undefined`

第二点是个 bug：`undefined` 根本不是键。用上一节的 `-?` 去掉可选修饰符就好了：

```ts
type KeysOfType<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T];

type Strict = KeysOfType<SeededSettings, number>; // "temperature" | "maxTokens"
```

**写"映射类型 + `[keyof T]`"时，习惯性地加上 `-?`。** 本节练习的类型测试里就有可选属性。这种问题怎么一步步查出来，见 [2.8 节](08-debugging-type-errors.md#查看类型悬停拆分prettify)。

想直接得到"只包含这些属性的对象类型"，可以用上一节的 `as` 过滤：

```ts
type PickByValue<T, V> = { [K in keyof T as T[K] extends V ? K : never]: T[K] };
// PickByValue<ChatSettings, number> = { temperature: number; maxTokens: number }
```

## 递归的条件类型

类型可以引用自己。下面的 `DeepReadonly` 把对象的每一层都变成只读：

```ts
type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T // 函数保持原样
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T; // string、number 等基本类型本来就不可变
```

```ts
interface AgentConfig {
  model: { name: string; temperature: number };
  tools: { name: string; enabled: boolean }[];
  onEvent: (name: string) => void;
}

declare const config: DeepReadonly<AgentConfig>;
config.model.temperature = 1; // ❌ Cannot assign to 'temperature' because it is a read-only property.
config.tools.push({ name: "shell", enabled: true }); // ❌ Property 'push' does not exist on type 'readonly { ... }[]'.
config.onEvent("start"); // ✅ 函数照常调用
```

几个值得注意的地方：

- 嵌套的三元表达式就是 `if / else if / else`，格式化后很好读
- 函数也是 `object`，所以要先把函数排除掉，否则函数会被映射成一个空对象类型
- `(...args: never[]) => unknown` 能匹配 **任何** 函数。参数写 `never[]` 是因为参数位置的兼容方向是反过来的：参数类型越"窄"，能匹配的函数越多，而 `never` 是最窄的类型。本章的章末项目（工具注册表）还会用到这个技巧
- 数组也被正确处理了：同态映射类型作用于数组时得到的还是数组（上一节），所以 `tools` 变成了 `readonly { readonly name: string; ... }[]`

## 用条件类型做返回类型

条件类型可以让函数的返回类型取决于参数：

```ts
type Parsed<K extends "number" | "boolean"> = K extends "number" ? number : boolean;

function parseAs<K extends "number" | "boolean">(text: string, kind: K): Parsed<K> {
  return (kind === "number" ? Number(text) : text === "true") as Parsed<K>;
}

const port = parseAs("8080", "number"); // number
const verbose = parseAs("true", "boolean"); // boolean
```

调用方用起来很舒服，但请注意实现里的 `as`。去掉它会报错：`Type 'number' is not assignable to type 'Parsed<K>'`。原因是检查 `kind === "number"` 只会收窄 **变量** `kind`，不会收窄 **类型参数** `K`。在函数内部，`K` 仍然是"某个还不知道的类型"，`Parsed<K>` 也就无法化简，TypeScript 无法确认 `number` 一定能赋值给它。

所以，条件返回类型的实现几乎总需要断言，而断言意味着 TypeScript 不再替你检查这部分逻辑。用之前先想想：拆成两个函数（`parseNumber`、`parseBoolean`）是不是更简单？

### 同样的问题：泛型函数里的 `KeysOfType`

想写一个"把某个数值字段加起来"的函数，很自然会用上前面的 `KeysOfType`：

```ts
function sumFieldWrong<T>(items: readonly T[], key: KeysOfType<T, number>): number {
  let total = 0;
  for (const item of items) {
    total += item[key];
    // ❌ Operator '+=' cannot be applied to types 'number' and 'T[KeysOfType<T, number>]'.
  }
  return total;
}
```

道理和上面一样：在函数内部 `T` 还是未知的，`KeysOfType<T, number>` 无法化简，TypeScript 也就推不出 `item[key]` 是 `number`。

解决办法是 **把约束反过来写**。不说"`K` 是 `T` 里值为 `number` 的键"，而说"`items` 是在 `K` 这个键上值为 `number` 的对象"：

```ts
function sumField<K extends PropertyKey>(items: readonly Record<K, number>[], key: K): number {
  let total = 0;
  for (const item of items) {
    total += item[key]; // ✅ Record<K, number>[K] 就是 number
  }
  return total;
}

sumField(usages, "inputTokens"); // ✅ 200
sumField(usages, "model");
// ❌ Argument of type 'UsageRecord[]' is not assignable to parameter of type 'readonly Record<"model", number>[]'.
```

现在类型信息直接写在约束里，不需要化简任何东西。代价是传错键时，错误报在第一个参数上：从错误信息可以看出，`K` 被推断成了 `"model"`，于是 `items` 不满足要求。读错误信息时要知道这一点。

**经验**：如果发现自己在泛型函数里需要断言，先试试能不能把约束换个方向写。

## 小结

- `T extends U ? X : Y`：`T` 能赋值给 `U` 时得到 `X`，否则得到 `Y`
- 裸露的类型参数遇到联合时会分配：每个成员分别求值，结果合并；`never` 会从联合中消失
- `Exclude`、`Extract` 是分配式条件类型；用 `Extract<联合, { 标签: 值 }>` 从可辨识联合里挑出成员
- 用 `[T] extends [U]` 阻止分配；判断 `never` 必须这样写
- 映射类型 + 条件类型 + `[keyof T]` 可以按值的类型筛选键；条件类型可以递归
- 在泛型函数内部，依赖类型参数的条件类型无法化简：条件返回类型的实现需要断言，能拆成多个函数时优先拆分；`KeysOfType` 这类约束可以试着反过来写

## 练习

[exercises/02-advanced-types/04-messages.ts](../../exercises/02-advanced-types/04-messages.ts)：用条件类型按角色筛选消息、找出特定类型的字段、实现 `DeepReadonly`。运行 `pnpm ex 04-messages`。

下一节：[2.5 infer：从类型中提取类型](05-infer.md)
