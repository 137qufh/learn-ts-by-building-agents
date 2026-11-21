# 1.5 字面量类型

> 这一节要解决的问题：消息的角色只能是 `"system"`、`"user"`、`"assistant"`、`"tool"` 之一；模型停止生成的原因只有固定几种。怎么让类型精确到"只能是这几个值"？

示例代码：[examples/05-literal-types.ts](examples/05-literal-types.ts)

## 字面量类型

除了 `string` 这种"所有字符串"的类型，TypeScript 还允许把 **一个具体的值** 当作类型：

```ts
let onlyUser: "user" = "user";
onlyUser = "assistant"; // ❌ Type '"assistant"' is not assignable to type '"user"'.
```

`"user"` 是一个只包含一个值的类型。数字和布尔值也可以：`42`、`true`。单独使用时它没什么用，配合 `|` 组成 **字面量联合类型** 才是它的主场：

```ts
type Role = "system" | "user" | "assistant" | "tool";

function badge(role: Role): string {
  return `[${role}]`;
}

badge("assistant"); // ✅
badge("asistant"); // ❌ 拼写错误当场被发现
```

好处不只是检查：在编辑器里输入 `badge("` 时，会自动弹出这四个合法值供你选择。

字面量联合是 TypeScript 最常用、也最有"TS 味"的特性之一。只要一个值的取值范围是固定的几种，就应该用它，而不是 `string`。

## 陷阱：对象属性会被拓宽

1.1 节说过，`const role = "user"` 推断出的类型是 `"user"`。但放进对象里就不一样了：

```ts
const draft = { role: "user", content: "hi" };
// draft 的类型是 { role: string; content: string }

badge(draft.role); // ❌ Argument of type 'string' is not assignable to parameter of type 'Role'.
```

原因是对象的属性可以被修改（`draft.role = "anything"` 是合法的），所以 TypeScript 把 `role` 推断为宽泛的 `string`。这叫 **类型拓宽（widening）**，是初学者最常遇到的困惑之一。三种解决方法：

**1. 给对象标注类型（最常用）**

```ts
interface Message {
  role: Role;
  content: string;
}
const typed: Message = { role: "user", content: "hi" };
```

**2. `as const`**：把整个对象变成只读，所有属性推断为字面量类型

```ts
const frozen = { role: "user", content: "hi" } as const;
// { readonly role: "user"; readonly content: "hi" }
```

**3. `satisfies`**：见本节后面。

实际开发中，构造消息、请求这类数据时几乎总是有对应的类型可以标注，所以方法 1 最常见。`as const` 主要用来定义常量表。

## 从数组推导出联合类型

有时你既需要一个类型，又需要一个运行时的列表（比如要校验外部输入是不是合法的角色、要在帮助信息里列出所有选项）。分别写两遍很容易不同步。更好的做法是只写一遍数组，从它推导出类型：

```ts
const STOP_REASONS = ["end_turn", "max_tokens", "tool_use"] as const;
type StopReason = (typeof STOP_REASONS)[number];
// "end_turn" | "max_tokens" | "tool_use"
```

拆开来看：

- `as const` 让数组的类型是 `readonly ["end_turn", "max_tokens", "tool_use"]`，保留了每个字面量
- `typeof STOP_REASONS` 出现在类型的位置上，意思是"取这个变量的类型"（和 JavaScript 运行时的 `typeof` 运算符是两回事）
- `[number]` 的意思是"用任意数字下标去取元素，得到的类型"，也就是所有元素类型的联合

以后要加一种停止原因，只需要改数组，类型会自动跟着变。第 2 章学习类型运算时，你会更深入地理解这种写法。

## 为什么不用 enum

很多语言用枚举（enum）表达"固定的几个值"，TypeScript 也有 `enum`。但本仓库开启了 `erasableSyntaxOnly`，不能用它。0.2 节讲过技术原因：`enum` 会生成运行时代码，Node.js 无法直接运行。除此之外，字面量联合本身就是更好的选择：

- **零运行时开销**：类型擦除后什么都不剩
- **直接用字符串**：`badge("user")` 就行，不需要先 `import { Role } from ...` 再写 `Role.User`
- **和外部数据天然匹配**：模型 API 返回的 JSON 里就是 `"role": "user"` 这样的字符串

如果你确实想要 `LogLevel.Info` 这种写法（比如为了在编辑器里集中查看所有选项），可以用 `as const` 对象：

```ts
const LogLevel = {
  Debug: "debug",
  Info: "info",
  Error: "error",
} as const;
type LogLevel = (typeof LogLevel)[keyof typeof LogLevel]; // "debug" | "info" | "error"

logAt(LogLevel.Info, "started"); // ✅
logAt("error", "boom"); // ✅ 直接写字面量也可以
```

`keyof typeof LogLevel` 得到所有键的联合 `"Debug" | "Info" | "Error"`，再用它去取值，就得到了所有值的联合。同一个名字 `LogLevel` 同时作为值和类型，这在 TypeScript 里是允许的，因为值和类型处在两个不同的"命名空间"里。

## `Record<Role, ...>`：每种情况都不能漏

```ts
const ROLE_LABELS: Record<Role, string> = {
  system: "系统",
  user: "用户",
  assistant: "助手",
  tool: "工具",
};
```

`Record<Role, string>` 要求 `Role` 的 **每一个** 成员都必须出现。少写一个会报错；更重要的是，以后给 `Role` 加了新成员，这里会立刻报错，提醒你补上对应的标签。让编译器帮你记住"所有需要同步修改的地方"，是 TypeScript 最有价值的能力之一。1.6 节的穷尽性检查是同一个思路。

## `satisfies`：检查，但不改变推断结果

有时你想检查一个值符合某个类型，但又不想让类型标注"抹掉"推断出来的细节。看一个价格表的例子：

```ts
interface Pricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

// 用类型标注
const annotated: Record<string, Pricing> = {
  "gpt-5": { inputPerMillion: 1.25, outputPerMillion: 10 },
};
annotated["gpt-5"]; // Pricing | undefined —— TS 只知道"键是某个字符串"
```

标注成 `Record<string, Pricing>` 之后，TypeScript 只记得"这是一个键为任意字符串的对象"，忘了具体有哪些键。于是读取 `"gpt-5"` 也得处理 `undefined`，拼错键名也不会报错。

`satisfies` 解决了这个问题：

```ts
const PRICES = {
  "gpt-5": { inputPerMillion: 1.25, outputPerMillion: 10 },
  "gpt-5-mini": { inputPerMillion: 0.25, outputPerMillion: 2 },
} satisfies Record<string, Pricing>;

PRICES["gpt-5"].inputPerMillion; // ✅ number，不带 undefined
PRICES["gpt-6"]; // ❌ Property 'gpt-6' does not exist ... Did you mean 'gpt-5'?
```

`值 satisfies 类型` 的意思是：**检查** 这个值是否符合类型（每个价格都必须是合法的 `Pricing`，写错字段名照样报错），但变量的类型依然是 **推断出来的** 那个更精确的类型。

什么时候用哪个？

- 想让变量 **就是** 某个类型（比如函数参数、需要满足接口的对象）：用类型标注
- 想 **检查** 一个常量表的格式，同时保留它具体的键和值：用 `satisfies`

## 模板字面量类型（预告）

字面量类型还可以描述字符串的"格式"：

```ts
type ToolCallId = `call_${string}`;
const callId: ToolCallId = "call_abc123"; // ✅
const badId: ToolCallId = "abc123"; // ❌
```

这叫 **模板字面量类型**。它在第 2 章会大显身手，这里先混个脸熟。

## 小结

- 字面量类型把类型精确到具体的值；字面量联合 `"a" | "b"` 是表达"固定几种取值"的首选
- 对象的属性会被拓宽为 `string`；用类型标注、`as const` 或 `satisfies` 保留字面量类型
- `as const` 数组 + `(typeof ARR)[number]`：一份数据同时得到运行时列表和类型
- 不用 `enum`，用字面量联合；需要 `X.Y` 写法时用 `as const` 对象
- `Record<联合类型, V>` 保证每种情况都有对应的值
- `satisfies` 只检查不改变推断，适合常量表

## 练习

[exercises/01-basics/04-stop-reason.ts](../../exercises/01-basics/04-stop-reason.ts)：处理模型的停止原因。运行 `pnpm ex 04-stop-reason`。

下一节：[1.6 联合类型与类型收窄](06-unions-and-narrowing.md)
