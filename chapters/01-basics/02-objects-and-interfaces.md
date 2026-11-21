# 1.2 对象类型、interface 与 type

> 这一节要解决的问题：agent 程序里到处都是结构化数据：消息、工具调用、用量统计、配置。怎么描述这些对象的"形状"？`interface` 和 `type` 到底该用哪个？

示例代码：[examples/02-objects-and-interfaces.ts](examples/02-objects-and-interfaces.ts)

## 用 interface 描述对象

```ts
interface ChatMessage {
  role: string;
  content: string;
  name?: string; // 可选属性
  readonly createdAt: number; // 只读属性
}

const hello: ChatMessage = { role: "user", content: "你好", createdAt: Date.now() };
```

- 少了必需的属性会报错：`Property 'createdAt' is missing ...`
- **可选属性** `name?: string` 表示这个属性可以不存在。读取它得到的类型是 `string | undefined`，使用前需要先检查
- **只读属性** `readonly createdAt` 在创建之后不能再赋值。注意 `readonly` 只在编译期起作用，运行时依然可以被修改（类型都被擦掉了）

> 关于可选属性还有一个细节：本仓库开启了 `exactOptionalPropertyTypes`，`name?: string` 表示"可以没有 `name`"，但 **不能** 写成 `{ name: undefined }`。为什么要这样区分，见 [1.8 节](08-strictness.md#exactoptionalpropertytypes可选不等于可以是-undefined)。

## 结构类型：只看形状，不看名字

```ts
interface Point {
  x: number;
  y: number;
}
interface Vector {
  x: number;
  y: number;
}

const p: Point = { x: 1, y: 2 };
const v: Vector = p; // ✅
```

`Point` 和 `Vector` 是两个不同的名字，但形状一样，所以互相兼容。这叫 **结构类型（structural typing）**：TypeScript 只关心"这个值有没有我需要的那些属性"，不关心它是用哪个名字声明的。

如果你用过 Java 或 C#，那里是 **名义类型（nominal typing）**：类必须显式声明 `implements` 某个接口才算兼容。TypeScript 的方式更像 Python 的鸭子类型，只不过是在编译期检查的。

推论：**属性多了也没关系**。一个有 `x`、`y`、`z` 的对象可以赋值给 `Point`：

```ts
const point3d = { x: 1, y: 2, z: 3 };
const flat: Point = point3d; // ✅ 运行时 z 依然在，类型不会删除数据
```

## 多余属性检查：防止拼写错误

但是下面这种写法会报错：

```ts
const typo: ChatMessage = {
  role: "user",
  contnet: "拼错了", // ❌ Object literal may only specify known properties ... Did you mean to write 'content'?
  content: "",
  createdAt: 0,
};
```

这和"属性多了也没关系"矛盾吗？不矛盾。TypeScript 对 **直接写出来的对象字面量** 做了额外的 **多余属性检查**：你当场写出一个对象并立即赋给某个类型，多出来的属性几乎一定是拼写错误，因为不会有其他代码用到它。而像 `point3d` 那样先存进变量再赋值，多余的属性可能在别处有用，所以不检查。

这个规则在实际开发中非常有用：构造 API 请求参数时，拼错一个可选参数名（比如 `max_token` 少了个 `s`），TypeScript 能当场发现。

## type 别名

`type` 可以给 **任何类型** 起名字，不只是对象：

```ts
type Usage = {
  inputTokens: number;
  outputTokens: number;
};
type ModelName = string;
type Role = "system" | "user" | "assistant"; // 联合类型，1.5 节讲
type Handler = (input: string) => string; // 函数类型，1.4 节讲
```

## interface 还是 type？

描述对象时两者几乎可以互换。真正的区别有这几点：

| 方面       | `interface`                        | `type`                                       |
| ---------- | ---------------------------------- | -------------------------------------------- |
| 能描述什么 | 只能描述对象（以及函数、类的形状） | 任何类型：联合、元组、函数、基本类型的别名…… |
| 扩展方式   | `interface B extends A { ... }`    | `type B = A & { ... }`（交叉类型）           |
| 属性冲突时 | `extends` **当场报错**             | `&` 不报错，冲突的属性悄悄变成 `never`       |
| 同名声明   | 自动 **合并** 成一个               | 报错：不允许重复声明                         |

两个值得展开的点：

**冲突时的行为。** `interface BadEvent extends BaseEvent { id: number }`（父接口里 `id` 是 `string`）会直接报错；而 `type T = BaseEvent & { id: number }` 不报错，`id` 的类型变成了 `string & number`，也就是 `never`（不可能存在的值）。等你构造对象时，才会看到一条莫名其妙的"不能赋值给 never"。`interface` 的错误报得更早、更清楚。

**声明合并。** 同一作用域里两个同名 `interface` 会合并：

```ts
interface Settings {
  model: string;
}
interface Settings {
  maxTokens: number;
}
// Settings 现在同时有 model 和 maxTokens
```

这个特性主要用来给第三方库的类型 **补充字段**（第 4 章会用到）。在自己的代码里，它更多是一个意外来源：不小心起了重名的接口，不会有任何报错。

### 本课程的约定

> **对象的形状用 `interface`，其他一切用 `type`。**

理由：`interface` 的报错更早更清楚，而且在类型很多的大项目里，`interface` 的继承关系可以被 TypeScript 缓存，检查起来更快；而联合类型、函数类型等只能用 `type`。社区里也有"全部用 `type`"的流派，同样合理。**重要的是在一个项目里保持一致**。

## 基于旧对象创建新对象：展开语法

agent 程序里经常需要"在原来的基础上改一点"，比如给消息加上时间戳、合并两份配置。推荐的做法是创建新对象，而不是修改原对象（原对象可能还被别处引用着）：

```ts
const base = { model: "gpt-5", temperature: 0.7 };
const tuned = { ...base, temperature: 0 }; // { model: "gpt-5", temperature: 0 }
```

`...base` 把 `base` 的所有属性复制进新对象，写在后面的属性会覆盖前面的同名属性。TypeScript 会正确推断出新对象的类型。

注意展开只复制一层：如果属性的值本身是对象，新旧两个对象会共享它。

## 键不固定的对象：Record 与索引签名

有时候你不知道对象有哪些键。比如模型调用工具时传来的参数，键和值都取决于具体的工具：

```ts
const toolArguments: Record<string, unknown> = { query: "TypeScript", limit: 5 };
```

`Record<K, V>` 表示"键是 K 类型、值是 V 类型的对象"。尖括号是 **泛型** 语法，第 2 章会详细讲，现在把它当成固定写法即可。另一种等价写法是 **索引签名**：`{ [key: string]: unknown }`。

`unknown` 表示"不知道是什么类型"，[1.7 节](07-any-unknown-never.md) 会讲怎么安全地使用它。

由于本仓库开启了 `noUncheckedIndexedAccess`，按任意键读取时，结果的类型会带上 `| undefined`：

```ts
const prices: Record<string, number> = { "gpt-5": 1.25 };
const price = prices["claude"]; // number | undefined
```

这很合理：TypeScript 无法知道某个键在运行时是否存在。

> 如果键需要频繁增删，或者键不是字符串，用 JavaScript 内置的 `Map<K, V>` 更合适，它的 `get()` 方法同样返回 `V | undefined`。

## 小结

- 用 `interface` 描述对象形状；`?` 表示可选，`readonly` 表示只读（只在编译期生效）
- TypeScript 是结构类型：形状匹配就兼容，名字不重要
- 直接写出的对象字面量会做多余属性检查，帮你抓住拼写错误
- `type` 能给任何类型起名；本课程约定对象用 `interface`，其他用 `type`
- 用 `{ ...obj, key: value }` 基于旧对象创建新对象，而不是直接修改
- 键不固定的对象用 `Record<string, V>`，读取结果带 `| undefined`

## 练习

[exercises/01-basics/01-usage.ts](../../exercises/01-basics/01-usage.ts)：实现 token 用量的统计与合并。运行 `pnpm ex 01-usage`。

下一节：[1.3 数组与元组](03-arrays-and-tuples.md)
