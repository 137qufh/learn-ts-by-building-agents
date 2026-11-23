# 5.2 Zod 基础

> 这一节要解决的问题：上一节自己写了一个迷你 schema 库。真实项目里要描述的数据复杂得多：数字的范围、字符串的长度、枚举、可辨识联合、记录、元组，错误信息还要好读。这些都由 Zod 提供。怎么用 Zod 描述 agent 里的数据？它的类型推导和本仓库的严格配置怎么配合？

示例代码：[examples/02-zod-basics.ts](examples/02-zod-basics.ts)

[Zod](https://zod.dev) 是 TypeScript 生态里使用最广的 schema 库：OpenAI 和 Anthropic 的官方 SDK、Vercel AI SDK、MCP 的 TypeScript SDK 都用它描述工具参数和结构化输出。本课程使用 Zod 4（仓库里已经安装好了）：

```ts
import { z } from "zod";
```

## schema 和类型

```ts
const Usage = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
type Usage = z.infer<typeof Usage>; // { inputTokens: number; outputTokens: number }
```

和练习 5-1 完全一样的思路：`Usage` 是一个值，`z.infer<typeof Usage>` 从它的类型推导出数据的类型。注意 schema 和类型用了同一个名字 `Usage`：一个是值，一个是类型，值和类型处在两个不同的"命名空间"里，可以同名（[1.5 节](../01-basics/05-literal-types.md)），使用时根据位置自动区分。这是 Zod 社区最常见的写法。

`.int()`、`.nonnegative()` 这类方法叫 **检查**（check）：它们只影响运行时的校验，不影响类型。`number` 就是 `number`，TypeScript 没法表达"非负整数"。

## parse 和 safeParse

```ts
Usage.parse(data); // 成功时返回数据，失败时抛出 ZodError
Usage.safeParse(data); // 永远不抛出：{ success: true, data } 或 { success: false, error }
```

该用哪个？回想 [3.4 节](../03-async/04-error-handling.md)的区分：

- **数据不对是"预料之中"的**（模型的输出、用户的配置文件）：用 `safeParse`，把失败当作一种正常的结果处理。比如把错误信息交还给模型，让它重新生成（5.5 节）
- **数据不对意味着 bug 或环境有严重问题**（程序启动时读自己写的配置）：用 `parse`，让它抛出

`safeParse` 的结果是一个可辨识联合，判断 `success` 之后才能拿到 `data` 或 `error`，和第 2 章的 `Result` 是一回事。

## 错误信息

`ZodError` 里有一个 `issues` 数组，每个问题是一个结构化的对象：

```ts
{ code: "too_small", path: ["inputTokens"], message: "Too small: expected number to be >=0", ... }
```

- `code`：问题的种类（`invalid_type`、`too_small`、`invalid_value`、`unrecognized_keys`……），程序可以根据它做不同的处理
- `path`：问题在输入里的位置，和练习 5-1 一样
- `message`：给人看的说明

要给人看时，`z.prettifyError(error)` 把所有问题格式化成多行文本：

```text
✖ Invalid input: expected number, received undefined
  → at inputTokens
```

自定义错误信息：检查方法的第二个参数，或者类型的 `error` 选项：

```ts
z.string({ error: "城市名必须是字符串" }).min(1, "城市名不能为空");
```

> Zod 自带多种语言的错误信息，`z.config(z.locales.zhCN())` 会把默认信息换成中文。不过要交给模型看的错误信息，英文通常效果更好；本课程保持默认的英文。

## 对象

```ts
Usage.parse({ inputTokens: 1, outputTokens: 2, extra: "x" }); // { inputTokens: 1, outputTokens: 2 }
```

和练习 5-1 一样，`z.object` 默认 **丢掉多余的键**，并且返回一个新对象。另外两种选择：

| 写法               | 多余的键 | 适合                                                   |
| ------------------ | -------- | ------------------------------------------------------ |
| `z.object(shape)`  | 丢掉     | 大多数情况：只取需要的，其余的不让它进城               |
| `z.strictObject()` | 报错     | 拼错的键需要被发现：用户写的配置文件、给模型的工具参数 |
| `z.looseObject()`  | 原样保留 | 需要把数据原样转发出去，又只想检查其中几个字段         |

对象 schema 可以像对象类型一样组合：`.extend({...})` 加字段，`.pick({ a: true })`、`.omit({ a: true })` 选取字段，`.partial()` 把所有字段变成可选，`.shape` 取出每个字段的 schema。它们对应 [2.7 节](../02-advanced-types/07-utility-types.md)的 `Pick`、`Omit`、`Partial`。

## 可选属性和 exactOptionalPropertyTypes

这是本仓库的严格配置和 Zod 配合时最需要注意的地方：

```ts
z.object({
  a: z.string().optional(), //      a?: string | undefined
  b: z.string().exactOptional(), // b?: string
  c: z.string().nullable(), //      c: string | null
  d: z.string().nullish(), //       d?: string | null | undefined
});
```

`.optional()` 推导出 `a?: string | undefined`，运行时也接受 `{ a: undefined }`。本仓库开启了 `exactOptionalPropertyTypes`（[1.8 节](../01-basics/08-strictness.md)），我们自己定义的类型都是 `a?: string`，两者 **不相同**：把 `z.infer` 的结果赋值给第 1 章的 `AssistantMessage` 会报错。

`.exactOptional()` 正好对应 `exactOptionalPropertyTypes`：键可以不存在，但存在时值不能是 `undefined`。本课程在需要和已有类型一致的地方都用它。

`null` 是另一回事：`.nullable()` 表示"键必须存在，值可以是 `null`"。JSON 里没有 `undefined`，只有 `null`，所以 API 响应里的"空"几乎都是 `null`，要用 `nullable` 或 `nullish` 描述。

## 字面量、枚举和可辨识联合

```ts
const Role = z.enum(["system", "user", "assistant", "tool"]);
Role.options; // ["system", "user", "assistant", "tool"]：运行时也能拿到所有值

const Event = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("tool_call"), name: z.string(), arguments: z.string() }),
  z.object({ type: z.literal("done") }),
]);
```

`z.discriminatedUnion` 对应 [1.6 节](../01-basics/06-unions-and-narrowing.md)的可辨识联合，推导出的类型可以照常用 `switch (event.type)` 收窄。

它和普通的 `z.union([...])` 的区别在于错误信息：`z.union` 不知道输入"想要"成为哪一种，只能把每个分支的失败都报告出来；`z.discriminatedUnion` 先看辨识字段，只用对应的那个分支校验，报告的问题准确得多：

```ts
Event.safeParse({ type: "tool_call", name: "search" });
// 只有一个问题：path 是 ["arguments"]
```

联合的成员有共同的辨识字段时，总是优先用 `z.discriminatedUnion`。

## 数组、元组、记录

```ts
z.array(z.string()).min(1); //        非空的字符串数组
z.array(Message).readonly(); //       readonly Message[]
z.tuple([z.string(), z.number()]); // [string, number]
z.record(z.string(), z.unknown()); // Record<string, unknown>：不接受数组和 null
```

`z.unknown()` 什么都接受，类型是 `unknown`。它适合"现在只确认外层结构，里面的内容由别人负责"的情况，比如工具参数：注册表确认它是一个对象，具体的结构由每个工具自己的 schema 校验。

## Zod 不是唯一的选择

Valibot、ArkType 等库做的是同一件事，API 各有特点。它们都实现了一个叫 [Standard Schema](https://standardschema.dev) 的公共接口（每个 schema 上都有一个 `~standard` 属性），所以越来越多的库（包括一些 AI SDK）可以接受任意一种 schema 库。本课程只用 Zod，学到的概念在其他库里完全通用。

## 小结

- `z.infer<typeof Schema>` 从 schema 推导类型；schema 和类型通常同名
- 预料之中的失败用 `safeParse`，意味着 bug 的失败用 `parse`
- `ZodError.issues` 是结构化的问题列表，`z.prettifyError` 把它变成给人看的文本
- 对象默认丢掉多余的键；需要发现拼错的键时用 `z.strictObject`
- 开启了 `exactOptionalPropertyTypes` 时，可选属性用 `.exactOptional()`；JSON 里的"空"是 `null`，用 `.nullable()`
- 有辨识字段的联合用 `z.discriminatedUnion`，错误信息更准确

## 练习

[exercises/05-validation/02-transcript-schema.ts](../../exercises/05-validation/02-transcript-schema.ts)：为第 1 章的聊天记录写 Zod schema，让 `z.infer` 推导出的类型和第 1 章的类型完全相同（含类型测试），再写一个从 JSON 文本读取聊天记录的 `loadTranscript`。运行 `pnpm ex 02-transcript-schema`。

下一节：[5.3 转换与细化](03-transforms-and-refinements.md)
