# 2.7 内置工具类型

> 这一节要解决的问题：标准库已经提供了一批现成的类型运算（`Partial`、`Pick`、`Omit`、`ReturnType`……）。它们各自做什么、怎么组合使用，又有哪些容易踩的坑？

示例代码：[examples/07-utility-types.ts](examples/07-utility-types.ts)

前面几节你已经亲手实现过其中的大部分。这一节把它们放在一起，从"会用"的角度过一遍。

## 一览

| 工具类型          | 作用                                         | 实现方式              |
| ----------------- | -------------------------------------------- | --------------------- |
| `Partial<T>`      | 所有属性变为可选                             | 映射类型（2.3）       |
| `Required<T>`     | 所有属性变为必需                             | 映射类型 `-?`（2.3）  |
| `Readonly<T>`     | 所有属性变为只读（只有第一层）               | 映射类型（2.3）       |
| `Pick<T, K>`      | 只保留键 `K`（`K` 必须是 `T` 的键）          | 映射类型（2.3）       |
| `Omit<T, K>`      | 删掉键 `K`（**不检查** `K` 是不是 `T` 的键） | `Pick` + `Exclude`    |
| `Record<K, V>`    | 键为 `K`、值为 `V` 的对象                    | 映射类型（2.3）       |
| `Exclude<U, X>`   | 从联合 `U` 中删掉能赋值给 `X` 的成员         | 分配式条件类型（2.4） |
| `Extract<U, X>`   | 从联合 `U` 中留下能赋值给 `X` 的成员         | 分配式条件类型（2.4） |
| `NonNullable<T>`  | 去掉 `null` 和 `undefined`                   | `T & {}`（2.4）       |
| `Parameters<F>`   | 函数的参数元组                               | `infer`（2.5）        |
| `ReturnType<F>`   | 函数的返回类型                               | `infer`（2.5）        |
| `Awaited<T>`      | 拆开 `Promise`                               | 递归 + `infer`（2.5） |
| `NoInfer<T>`      | 不从这个位置推断类型参数                     | 编译器内置（2.1）     |
| `Uppercase<S>` 等 | 字符串字面量的大小写转换                     | 编译器内置（2.6）     |

想看某个工具类型的确切定义，在编辑器里按住 Ctrl（macOS 上是 Cmd）点击它的名字，就会跳到标准库的声明文件 `lib.es5.d.ts`。读标准库的类型定义是提高类型水平的好办法，它们都很短。

## 组合使用

工具类型的威力在于组合。以一个聊天请求为例：

```ts
interface ChatRequest {
  model: string;
  messages: readonly { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}
```

**"挑出几个可选字段，并且都变成必填"**，用来描述默认值：

```ts
type Tunables = Required<Pick<ChatRequest, "temperature" | "maxTokens" | "stream">>;
// { temperature: number; maxTokens: number; stream: boolean; }

const DEFAULTS: Readonly<Tunables> = { temperature: 1, maxTokens: 1024, stream: false };
```

**"补齐默认值之后的请求"**：

```ts
type ResolvedRequest = ChatRequest & Tunables;

function resolve(request: ChatRequest): ResolvedRequest {
  return { ...DEFAULTS, ...request };
}

resolve({ model: "gpt-5", messages: [] }).maxTokens; // number，不再带 undefined
```

`ChatRequest & Tunables` 里，`maxTokens` 一边是可选的，一边是必需的，交叉之后就是必需的。展开时，`request` 里出现的字段覆盖默认值，没出现的保留默认值。这里能放心地展开，要归功于 `exactOptionalPropertyTypes`（[1.8 节](../01-basics/08-strictness.md)）：可选属性要么不存在，要么是 `number`，不会是显式的 `undefined`，否则 `{ maxTokens: undefined }` 会把默认值覆盖掉。用户只需要提供部分参数，函数内部拿到的却是完整的配置，下游代码不必到处写 `?? 默认值`。

**"除了某些字段，其他都可以改"**：

```ts
type RequestUpdate = Partial<Omit<ChatRequest, "model">>;
```

**"拿到函数的参数和异步返回值"**：

```ts
async function callModel(request: ResolvedRequest, signal?: AbortSignal) {
  return { content: `你好，我是 ${request.model}`, finishReason: "stop" as const };
}

type CallArgs = Parameters<typeof callModel>; // [request: ResolvedRequest, signal?: AbortSignal | undefined]
type ModelReply = Awaited<ReturnType<typeof callModel>>; // { content: string; finishReason: "stop" }
```

不用另外声明返回值的类型，函数改了，类型自动跟着变。注意 `Parameters` 把可选参数显示成了 `signal?: AbortSignal | undefined`：可选参数本来就允许传 `undefined`，`exactOptionalPropertyTypes` 只管对象的属性，不管函数参数。

> 嵌套三四层的工具类型很快就会变得难读。如果一个类型会在很多地方用到，或者它本身就是一个重要的概念（比如 `ResolvedRequest`），给它起个名字；悬停时看不清它的结构怎么办，见 [2.8 节](08-debugging-type-errors.md)。

## 坑 1：`Omit` 不检查键名

```ts
type Typo = Pick<ChatRequest, "modle">;
// ❌ Type '"modle"' does not satisfy the constraint 'keyof ChatRequest'.

type SilentTypo = Omit<ChatRequest, "mesages">; // 不报错！只是什么都没删掉
```

`Pick` 的定义是 `Pick<T, K extends keyof T>`，而 `Omit` 是 `Omit<T, K extends keyof any>`。这是有意的设计：允许"删掉一个可能不存在的键"在某些泛型代码里很方便。代价是拼错的键名会被悄悄忽略。

需要检查时，自己包一层：

```ts
type StrictOmit<T, K extends keyof T> = Omit<T, K>;

type Caught = StrictOmit<ChatRequest, "mesages">;
// ❌ Type '"mesages"' does not satisfy the constraint 'keyof ChatRequest'.
```

## 坑 2：`Omit` 和联合类型

对可辨识联合使用 `Omit`，结果往往不是你想要的：它会把联合"压扁"成一个对象，辨识字段也就失去了作用。这是一个足够重要的坑，[2.8 节](08-debugging-type-errors.md#omit-压扁了联合) 会从错误信息出发完整地分析它。

## 坑 3：`Partial` 和 `Readonly` 只作用于第一层

```ts
interface AgentConfig {
  model: { name: string; temperature: number };
  maxTurns: number;
}

const shallow: Partial<AgentConfig> = { model: { name: "gpt-5" } };
// ❌ Property 'temperature' is missing in type '{ name: string; }'
//    but required in type '{ name: string; temperature: number; }'.
```

`Partial` 只让 `model` 这个属性本身变成可选，`model` 里面的字段依然是必需的。需要"每一层"时，要像 2.4 节的 `DeepReadonly` 那样写递归类型。

同理，`Readonly` 也只是编译期的约束（[1.2 节](../01-basics/02-objects-and-interfaces.md)），而且只管第一层。真正需要运行时不可变时，用 `Object.freeze`（同样只冻结第一层，2.4 节练习里的 `deepFreeze` 就是为此而写）。

## 小结

- 内置工具类型都是用映射类型、条件类型、`infer` 写成的，按住 Ctrl/Cmd 点击就能看到定义
- 组合使用：`Required<Pick<T, K>>` 描述默认值，`T & 默认值类型` 描述补齐后的结果，`Partial<Omit<T, K>>` 描述更新
- `Omit` 不检查键名，需要时自己写 `StrictOmit`；`Omit` 用在联合上会压扁联合
- `Partial`、`Readonly` 只作用于第一层
- 复杂的组合要起名字

## 练习

[exercises/02-advanced-types/07-chat-request.ts](../../exercises/02-advanced-types/07-chat-request.ts)：用工具类型描述聊天请求的默认值、补齐、更新和摘要。运行 `pnpm ex 07-chat-request`。

下一节：[2.8 读懂和调试复杂的类型错误](08-debugging-type-errors.md)
