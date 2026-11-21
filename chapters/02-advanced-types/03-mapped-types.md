# 2.3 映射类型

> 这一节要解决的问题：有了 `ModelSettings`，怎么得到"所有字段都可选的版本"、"所有字段都只读的版本"、"每个字段一个比较函数的表"，而不必把每个字段再抄一遍？

示例代码：[examples/03-mapped-types.ts](examples/03-mapped-types.ts)

上一节学会了从类型里"取出"东西。这一节学习"批量生成"：**映射类型** 遍历一组键，为每个键生成一个属性。它是类型层面的 `for` 循环。

## 基本语法

```ts
type Flags = { [K in "search" | "read_file" | "write_file"]: boolean };
// { search: boolean; read_file: boolean; write_file: boolean; }
```

`[K in 联合]` 让 `K` 依次取联合里的每个成员，每取一个就生成一个属性。读作"对于 `K` 属于这个联合，生成属性 `K`，类型是 `boolean`"。

1.5 节用过的 `Record` 就是这样实现的，标准库里的定义只有一行：

```ts
type Record<K extends keyof any, T> = { [P in K]: T };
```

`keyof any` 是 `string | number | symbol`，也就是所有能做对象键的类型。它有一个内置的别名 `PropertyKey`。

## 遍历 `keyof T`

映射类型真正的威力在于遍历 **另一个类型的键**：

```ts
interface ModelSettings {
  model: string;
  temperature: number;
  maxTokens?: number;
  readonly stream: boolean;
}

type Stringified<T> = { [K in keyof T]: string };
// { model: string; temperature: string; maxTokens?: string; readonly stream: string; }
```

比如从环境变量读进来的配置，值都是字符串，形状却和 `ModelSettings` 一样，这时就可以用 `Stringified<ModelSettings>` 描述它。

注意结果保留了原来的 `?` 和 `readonly`。`[K in keyof T]` 这种形式的映射类型会自动保留每个属性的修饰符，所以常被称为 **同态映射类型**（homomorphic mapped type，"保持原有结构"的意思）。

### 用 `T[K]` 引用原来的类型

在属性类型里写 `T[K]`，每个生成的属性就能"知道"它原来是什么类型：

```ts
type Comparators<T> = { [K in keyof T]-?: (a: T[K], b: T[K]) => boolean };

const same = <V>(a: V, b: V): boolean => a === b; // 适用于任何类型的通用比较

const settingComparators: Comparators<ModelSettings> = {
  model: (a, b) => a.toLowerCase() === b.toLowerCase(), // a、b 自动推断为 string
  temperature: (a, b) => Math.abs(a - b) < 1e-9, // number
  maxTokens: same,
  stream: same,
};
```

这类"每个字段一项"的表在实际代码里非常常见：比较函数、校验函数、表单标签、序列化规则……用映射类型写出来有两个好处：

1. **不会漏**：少写一个字段会报错 `Property 'stream' is missing in type ... but required in type 'Comparators<ModelSettings>'`。以后给 `ModelSettings` 加了新字段，编译器会把每一张需要补充的表都指出来
2. **不用标注**：每个函数的参数类型都从 `T[K]` 推断出来

上一节练习里的 `changedSettings` 自己维护了一个键列表，新增字段时编译器不会提醒。本节的练习会用 `Comparators` 改进它。

## 修饰符：`readonly`、`?` 以及去掉它们

映射类型里可以给每个属性加上修饰符，也可以用 `-` 去掉：

```ts
type MyPartial<T> = { [K in keyof T]?: T[K] }; // 全部变成可选
type MyRequired<T> = { [K in keyof T]-?: T[K] }; // 去掉可选
type MyReadonly<T> = { readonly [K in keyof T]: T[K] }; // 全部只读
type Mutable<T> = { -readonly [K in keyof T]: T[K] }; // 去掉只读
```

前三个就是标准库里的 `Partial`、`Required`、`Readonly`，[2.7 节](07-utility-types.md) 会系统地介绍它们。`Mutable` 不在标准库里，但很常用，本节练习会让你实现它。

上面的 `Comparators` 用了 `-?`：即使 `maxTokens` 是可选的，比较函数也必须提供。

## 键重映射：`as`

在 `in` 后面加 `as`，可以把键改写成别的名字：

```ts
type Setters<T> = { [K in keyof T as `set${Capitalize<K & string>}`]: (value: T[K]) => void };

type SettingSetters = Setters<Pick<ModelSettings, "model" | "temperature">>;
// { setModel: (value: string) => void; setTemperature: (value: number) => void; }
```

这里用到了几个还没正式介绍的东西，先混个脸熟：

- `` `set${...}` `` 是模板字面量类型（1.5 节见过一次，[2.6 节](06-template-literal-types.md) 详讲），`Capitalize` 把首字母变成大写
- `K & string`：上一节讲过，`keyof T` 可能包含 `number` 和 `symbol`，而 `symbol` 不能拼进字符串。`& string` 只保留其中的字符串键
- `Pick<T, 键>` 从 `T` 里挑出部分属性（2.7 节）

`as` 还有一个重要用途：**映射到 `never` 的键会被删掉**。借助这一点可以过滤属性：

```ts
type WithoutStream<T> = { [K in keyof T as Exclude<K, "stream">]: T[K] };
// { model: string; temperature: number; maxTokens?: number; }
```

`Exclude<K, "stream">` 在 `K` 是 `"stream"` 时得到 `never`，其他时候得到 `K` 本身。它是怎么做到的，正是下一节条件类型的内容。

## 映射数组和元组

同态映射类型作用在数组或元组上时，结果仍然是数组或元组，只是每个元素的类型被映射了：

```ts
type Nullable<T> = { [K in keyof T]: T[K] | null };
type Row = Nullable<[string, number]>; // [string | null, number | null]
```

而不是一个带着 `length`、`push` 等一堆键的奇怪对象。这让很多映射类型对数组"自然地"成立，后面写递归类型时会用到。

## 小结

- `{ [K in 联合]: 类型 }` 为联合的每个成员生成一个属性；`Record` 就是这样实现的
- `{ [K in keyof T]: ... }` 基于已有类型生成新类型，并保留原有的 `?` 和 `readonly`
- 在属性类型里用 `T[K]` 引用原来的类型；"每个字段一项"的表用映射类型写，新增字段时编译器会提醒
- `?`、`readonly` 可以加上，也可以用 `-?`、`-readonly` 去掉
- `as` 重映射键名；映射到 `never` 的键会被删掉

## 练习

[exercises/02-advanced-types/03-agent-state.ts](../../exercises/02-advanced-types/03-agent-state.ts)：用映射类型为 agent 的状态写比较表和变更监听。运行 `pnpm ex 03-agent-state`。

下一节：[2.4 条件类型](04-conditional-types.md)
