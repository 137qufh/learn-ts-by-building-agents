# 5.7 章末项目：用 Zod 定义工具

> 这一节要解决的问题：第 2 章的工具注册表用手写的迷你 schema 描述参数，只支持四种简单类型，校验也是手写的。把它换成 Zod：一份 schema 同时给出 TypeScript 类型、给模型看的 JSON Schema 和收到参数后的校验。做好之后，作为 `@learn-ts/agent-kit` 的新功能发布 0.2.0。

## 背景：从 ParamSpec 到 Zod

第 2 章的工具长这样：

```ts
const weather = defineTool({
  name: "get_weather",
  description: "查询城市天气",
  parameters: {
    city: { type: "string", description: "城市名" },
    unit: { type: "enum", values: ["c", "f"], optional: true },
  },
  execute: (args) => ..., // args: { city: string; unit?: "c" | "f" }
});
```

[第 2 章项目](../02-advanced-types/09-project-tool-registry.md)的 `ParamSpec` 是一个迷你 schema：`InferArgs` 从它推导类型（2.4、2.5 节），`toSchema` 生成 JSON Schema，`validateArgs` 做校验。三样东西都要自己写，而且只支持字符串、数字、布尔值和枚举。想支持数组、嵌套对象、范围、默认值？每一样都要在三个地方各写一遍。

这一章的每一节，都是在为替换它做准备：

| 要做的事                                              | 用到的知识 |
| ----------------------------------------------------- | ---------- |
| 参数用 Zod schema 描述，`execute` 的参数类型自动推导  | 5.2、5.3   |
| 在代码里调用时用输入类型，工具拿到的是输出类型        | 5.3        |
| 生成给模型的函数描述，`strict` 的工具检查严格模式规则 | 5.4        |
| 解析模型给的参数，把问题写成模型看得懂的错误          | 5.5        |
| 工具的结果和错误都变成文本，交回给模型                | 5.5        |

现在工具长这样：

```ts
const readFile = defineTool({
  name: "read_file",
  description: "读取工作目录里的一个文本文件",
  parameters: z.object({
    path: z.string().min(1).describe("相对于工作目录的路径"),
    maxLines: z.number().int().min(1).max(500).default(100),
  }),
  execute: ({ path, maxLines }, { signal }) => ..., // { path: string; maxLines: number }
});
```

## 设计

### defineTool：类型推导交给 Zod

```ts
export function defineTool<const N extends string, S extends z.ZodType, R>(
  tool: ZodTool<N, S, R>,
): ZodTool<N, S, R>;
```

和第 2 章比，少了两样东西：

- **`S` 不需要 `const`**。第 2 章需要 `const S` 来保留 `"enum"`、`optional: true` 这些字面量；Zod schema 是一个类实例，它的类型（比如 `ZodObject<{ path: ZodString; … }>`）本身就带着全部信息
- **不需要 `InferArgs`**。`z.output<S>` 就是第 2 章 `InferArgs` 做的事，而且支持 Zod 能表达的一切

### 输入和输出

一个工具的参数有两个类型（5.3 节）：

- `execute` 拿到的是 **输出** 类型：默认值已经填上，转换已经做完。`maxLines` 是 `number`，不是 `number | undefined`
- 在代码里调用 `tools.call("read_file", { path: "a.ts" })` 时，传的是 **输入** 类型：有默认值的字段可以不传

所以 `call` 也要先用 schema 解析参数，再交给 `execute`。不解析，`maxLines` 就会是 `undefined`，和 `execute` 的类型对不上。

### dispatch：给模型的结果都是文本

```ts
type ToolResult = { id: string; ok: boolean; content: string };
```

第 2 章的 `dispatch` 返回 `value: unknown`，由调用方决定怎么转成文本。这一次直接返回 `content: string`，因为模型 API 的 tool 消息就是文本：字符串原样给，其他值转成 JSON。`ok` 用来区分成功和失败，对应第 1 章 `ToolMessage` 的 `isError`。

除了取消，`dispatch` 从不抛出：未知的工具、不合格的参数、工具自己抛出的错误，都变成 `ok: false` 的结果，交回给模型（5.5 节）。错误信息里要有足够的线索让模型改正，比如未知工具时列出可用的工具，文件不存在时列出存在的文件。

取消是唯一的例外：用户按下了 Ctrl+C，这时不该再告诉模型"工具执行失败"，而是让整个回合停下来（[3.6 节](../03-async/06-cancellation.md)）。

### 启动时生成 schema

`createToolbox` 在创建时就为每个工具生成函数描述。`strict: true` 的工具如果用了 `.optional()`，`strictFunction` 会在这里抛出，也就是在程序启动时，而不是在第一次请求模型、收到一个 400 错误时。**能在启动时发现的错误，不要留到运行时。**

## 项目练习

[exercises/05-validation/project/toolbox.ts](../../exercises/05-validation/project/toolbox.ts)，运行 `pnpm ex toolbox`。

文件开头的注释写了完整的规则，按四个部分完成：`defineTool` 的签名、`ArgsInput` 和 `ResultOf` 两个类型工具、`toContent`、`createToolbox`。它会用到你在练习 5-4 和 5-5 里写的 `defineFunction`、`strictFunction` 和 `parseToolArguments`。

做完之后运行演示：

```sh
pnpm tsx --conditions=@learn-ts/source chapters/05-validation/project/demo.ts
```

[演示](project/demo.ts)里，假的模型第一次把 `path` 传成了空字符串、`maxLines` 传成了字符串，第二次猜错了文件名，每次都从错误信息里得到线索，第三次才读到文件：

```text
[✗ read_file({"path":"","maxLines":"10"})]
    参数不符合要求：
    - path: path 不能为空
    - maxLines: Invalid input: expected number, received string
[✗ read_file({"path":"agent.ts"})]
    工具执行失败：文件不存在：agent.ts。存在的文件：src/agent.ts, README.md
[✓ read_file({"path":"src/agent.ts","maxLines":3})]
```

这就是真实的 agent 每天在做的事。

## 发布 @learn-ts/agent-kit 0.2.0

参考答案已经整合进了 [packages/agent-kit](../../packages/agent-kit/)，作为一个新的入口：

```ts
import { createToolbox, defineTool } from "@learn-ts/agent-kit/zod";
```

这里有几个值得说一说的决定。

### 为什么是单独的入口

包的主入口 `@learn-ts/agent-kit` 不导入 zod。只用注册表和客户端的使用者，不需要安装 zod，也不会加载它。需要 Zod 工具的人从 `@learn-ts/agent-kit/zod` 导入，这和 OpenAI 官方 SDK 的 `openai/helpers/zod` 是同一个思路。

[包的测试](../../packages/agent-kit/test/agent-kit.test.ts)守着这件事：主入口的源码里不能出现 `from "zod"`。

### 为什么 zod 是 peerDependency

```json
"peerDependencies": { "zod": "^4.6.0" },
"peerDependenciesMeta": { "zod": { "optional": true } },
"devDependencies": { "zod": "^4.6.7" }
```

使用者传进来的 schema 是 **他自己安装的** zod 创建的。如果 agent-kit 在 `dependencies` 里带上自己的一份 zod，两份 zod 可能版本不同：`instanceof z.ZodError` 会失败，类型也可能对不上。`peerDependencies` 的意思是"我和你用同一份，由你来安装"；`optional: true` 表示只用主入口时可以不装。`devDependencies` 里的那一份，是包自己开发和测试时用的。

范围写 `^4.6.0`，因为这是测试过的版本。写得更宽（比如 `^4.0.0`）对使用者更友好，但那是一个需要用更早的版本跑一遍测试才能做出的承诺。

### 为什么是 0.2.0

回顾 [4.9 节](../04-tooling/09-project-agent-kit.md)的思考题：增加功能，不破坏已有的使用方式，是一个 **minor** 版本。这次的变化：

- 新增入口 `./zod`
- `ChatRequest.tools` 的类型从 `ToolSchema[]` 放宽成 `readonly (ToolSchema | FunctionDefinition)[]`，这样 `toolbox.schemas()` 可以直接传进去。放宽一个 **参数** 的类型，原来的调用依然成立，所以是兼容的变化（反过来，收窄参数类型、或者放宽返回值类型，才会破坏使用者）
- 主入口的名字一个都没有改

0.x 版本按照惯例，minor 的变化也可能是不兼容的。所以 npm 对 0.x 的 `^` 特别保守（[4.3 节](../04-tooling/03-publishing.md)）：写着 `^0.1.0` 的使用者 **不会** 自动升级到 0.2.0，必须自己改版本范围。这对使用者是保护，对作者是提醒：0.x 的每个 minor 都相当于一次大版本，发布说明里要写清楚怎么升级。养成按规则对待版本号的习惯，到 1.0 时就不会手忙脚乱。

### 为什么包里的 parseChunk 没有换成 Zod

练习 5-6 已经写出了数据块的 schema，但包的客户端里还是第 3 章的 `parseChunk`。原因就是上面的第一个决定：客户端在主入口里，用了 Zod 就等于强迫所有使用者安装它。另外 `isolatedDeclarations`（[4.3 节](../04-tooling/03-publishing.md)）要求导出的 schema 写出完整的类型标注，`z.object({ … })` 的类型写出来非常长。

这是一个真实的权衡：一个依赖带来的方便，和它给每个使用者增加的成本。思考题里有另一种做法。

## 思考题

1. `ToolResult` 里只有文本。如果一个工具想返回一张图片给模型（多模态），`content` 应该怎么设计？`toContent` 要怎么改？
2. 模型一次请求了五个工具调用，`dispatch` 应该一个个执行，还是并发执行？用第 3 章的什么工具可以限制并发数？哪些工具不能并发（比如两个都在写同一个文件）？
3. 不用 Zod，能不能让包里的 `parseChunk` 也不再用 `as`？（提示：只检查真正用到的字段，用 1.6 节的收窄写一个小的检查函数；5.1 节的迷你 schema 也是一种思路）
4. 严格模式下，可选字段用 `.nullable().transform(…)` 表达。能不能写一个函数，把普通的 schema 自动转换成适合严格模式的版本？会遇到什么困难？

## 和后面章节的关系

- **第 6 章** 开始写 harness 本身：agent 的主循环、对话的管理、工具的执行。它通过 `@learn-ts/agent-kit` 和 `@learn-ts/agent-kit/zod` 使用前五章的成果

## 小结

- 一份 Zod schema 同时给出参数的类型、给模型的 JSON Schema 和收到参数后的校验，不会再不一致
- `execute` 拿到输出类型，`call` 接受输入类型；所以 `call` 也要先解析
- `dispatch` 把一切（除了取消）变成给模型看的文本结果；错误信息要带着改正的线索
- 能在启动时发现的错误（严格模式的 schema 问题、重复的工具名），不要留到运行时
- 给包加依赖是一个设计决定：单独的入口、peerDependency、版本号，都是为了让使用者少付代价
