# 5.1 信任边界与手写校验

> 这一节要解决的问题：TypeScript 的类型只在编译期存在。模型的回复、API 的响应、环境变量、用户输入，这些数据在运行时才到达，类型系统根本看不到它们。怎么保证"类型说它是 `Usage`"的时候，它真的是 `Usage`？

示例代码：[examples/01-trust-boundaries.ts](examples/01-trust-boundaries.ts)

这一章讲 **运行时校验**：在数据进入程序的地方检查它，并且让检查和类型保持一致。前四章里我们好几次说"第 5 章会解决"，指的就是这件事：第 1 章的手写收窄，第 2 章工具注册表里手写的迷你 schema，第 3 章 `parseChunk` 里的 `as`。

## 类型会被擦除

[0.2 节](../00-setup/02-running-ts.md)讲过：运行 TypeScript 时，类型被直接删掉。`JSON.parse` 返回的东西是什么，完全取决于运行时收到的文本：

```ts
const body = '{"prompt_tokens": 12, "completion_tokens": 30}';
const usage = JSON.parse(body) as Usage; // 编译通过

usage.inputTokens + usage.outputTokens; // NaN
```

`as` 的意思是"相信我"，编译器就真的相信了。字段名对不上（某个兼容接口用了 OpenAI 的原始字段名），得到的不是报错，而是一个 `NaN`，悄悄流进费用统计、上下文长度计算。真正出问题的地方离这一行很远，排查起来非常痛苦。

环境变量是另一个常见的坑：`process.env` 里的值 **永远是字符串**。

```ts
const maxRetries = process.env.MAX_RETRIES ?? 2; // string | 2
maxRetries + 1; // "31"，而不是 4
```

## 信任边界

把程序想象成一座城：城里的数据都检查过了，类型可以信任；城墙之外的数据什么都可能是。数据穿过城墙的地方，叫 **信任边界**。对 agent 来说，边界非常多：

| 数据从哪里来                   | 可能出什么问题                                       |
| ------------------------------ | ---------------------------------------------------- |
| 模型的工具调用参数             | 拼错参数名、类型不对、编造字段、甚至不是合法的 JSON  |
| 模型的"结构化输出"             | 少了字段、多了字段、包在 Markdown 代码块里           |
| 模型 API 的响应                | 不同服务商的格式不一样、版本升级加了新字段、错误格式 |
| 环境变量、命令行参数           | 永远是字符串；可能没设置；可能有多余的空格           |
| 配置文件、会话记录文件         | 用户手改过、旧版本写的、写到一半程序崩了             |
| 工具的执行结果（HTTP、子进程） | 和上面的 API 响应一样                                |

规则很简单：**在边界上检查一次，之后就可以放心地信任类型**。不在边界检查，问题就会扩散到城里的每一个角落；在城里到处检查，代码会被防御性的 `if` 淹没。

## 手写校验

第 1 章的 [1.7 节](../01-basics/07-any-unknown-never.md)教过手写的办法：把外部数据当作 `unknown`，一步步收窄。

```ts
function parseUsage(value: unknown): Usage | string {
  if (typeof value !== "object" || value === null) {
    return "不是对象";
  }
  if (!("inputTokens" in value) || typeof value.inputTokens !== "number") {
    return "inputTokens 应该是数字";
  }
  if (!("outputTokens" in value) || typeof value.outputTokens !== "number") {
    return "outputTokens 应该是数字";
  }
  return { inputTokens: value.inputTokens, outputTokens: value.outputTokens };
}
```

它是对的，但问题也很明显：

- **太长。** 两个字段写了 10 行。第 1 章的消息类型有十几个字段、好几层嵌套，手写校验要好几百行
- **类型和校验是两份东西。** 给 `Usage` 加一个字段，校验函数不会提醒你也要改。久而久之两者就对不上了
- **错误信息很弱。** 只说了第一个问题，没说问题在哪个位置（第 3 条消息的第 2 个工具调用的哪个参数？）

### 类型谓词也会撒谎

另一种常见的写法是类型谓词 `value is Usage`（[1.6 节](../01-basics/06-unions-and-narrowing.md)）。但编译器不检查谓词的实现：

```ts
function isUsage(value: unknown): value is Usage {
  return typeof value === "object" && value !== null; // 只检查了一半，编译通过
}
```

谓词本质上和 `as` 一样，是"相信我"。用它的时候，正确性完全靠你自己。

## 解析，而不是验证

注意上面 `parseUsage` 和 `isUsage` 的区别：`isUsage` 回答"是不是"（返回 `boolean`），`parseUsage` 返回 **一个新的、类型正确的值**，并且只包含检查过的字段。

这个区别有个名字："Parse, don't validate"（解析，而不是验证）。解析的好处是：

1. **结果的类型本身就是证明。** 拿到一个 `Usage`，就说明它通过了检查，不需要在别处再检查一次
2. **多余的字段被丢掉了。** 模型在工具参数里多塞了一个字段，或者用户的配置文件里有个拼错的键，下游的代码不会看到它们
3. **可以顺便做转换。** 把字符串 `"3"` 变成数字 `3`，把 ISO 字符串变成 `Date`（5.3 节）

## schema：描述类型的值

怎么让校验不再繁琐，又和类型保持一致？答案是把"怎么检查一种数据"写成一个 **值**，而类型从这个值的 **类型** 推导出来。这样的值叫 **schema**：

```ts
interface Schema<T> {
  parse(input: unknown): T | undefined;
}
type Infer<S> = S extends Schema<infer T> ? T : never;

const UsageSchema = object({ inputTokens: number(), outputTokens: number() });
type Usage = Infer<typeof UsageSchema>; // { inputTokens: number; outputTokens: number }

UsageSchema.parse(JSON.parse(body)); // 运行时检查；成功时的类型就是 Usage
```

只写一份 `UsageSchema`，就同时得到了 **运行时的检查** 和 **编译期的类型**，两者不可能对不上。示例代码的第 5 部分用 20 行实现了一个最简单的版本。

如果你做过第 2 章的项目，会觉得这很眼熟：工具注册表里的 `ParamSpec` 和 `InferArgs` 就是同一个思路，只是只支持四种简单类型。这一节的练习把它做完整：嵌套对象、数组、可选属性、联合、带路径的错误信息。

做完这道练习，你就知道 [Zod](https://zod.dev) 的核心是怎么工作的了。下一节开始，我们就改用 Zod：它是 TypeScript 生态里最流行的 schema 库，覆盖的情况多得多，错误信息也更完善。

## 小结

- 类型在运行时不存在。`as` 和类型谓词都是"相信我"，编译器不会检查
- 数据进入程序的地方是信任边界：在边界上检查一次，之后信任类型
- 解析而不是验证：返回一个新的、只包含检查过的字段的值，它的类型就是证明
- schema 是描述类型的值：运行时用它检查数据，编译期从它推导类型，只写一份，不会不一致

## 练习

[exercises/05-validation/01-mini-schema.ts](../../exercises/05-validation/01-mini-schema.ts)：实现一个迷你 schema 库：`string`、`number`、`boolean`、`literal`、`optional`、`array`、`object`、`union`，以及从 schema 推导类型的 `Infer` 和 `InferShape`（含类型测试）。错误信息要带上出问题的位置。运行 `pnpm ex 01-mini-schema`。

下一节：[5.2 Zod 基础](02-zod-basics.md)
