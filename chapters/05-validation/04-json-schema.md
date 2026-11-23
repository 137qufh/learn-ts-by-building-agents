# 5.4 JSON Schema：给模型看的 schema

> 这一节要解决的问题：模型怎么知道一个工具要什么参数？同一份 Zod schema，能不能既用来校验参数，又用来告诉模型参数长什么样？

示例代码：[examples/04-json-schema.ts](examples/04-json-schema.ts)

## 模型只看得懂 JSON

调用模型 API 时，工具是这样描述的（OpenAI 的格式，其他厂商大同小异）：

```json
{
  "type": "function",
  "function": {
    "name": "read_file",
    "description": "读取一个文本文件",
    "parameters": {
      "type": "object",
      "properties": { "path": { "type": "string", "description": "文件路径" } },
      "required": ["path"],
      "additionalProperties": false
    }
  }
}
```

`parameters` 是一份 **JSON Schema**：一个用 JSON 描述"JSON 数据应该长什么样"的标准。它和 Zod schema 做的是同一件事，区别在于它本身是数据，可以通过网络发给模型；而 Zod schema 是 TypeScript 里的值，带着函数，发不出去。

[第 2 章的项目](../02-advanced-types/09-project-tool-registry.md)里，`toSchema` 手写了一个很小的子集：只有字符串、数字、布尔值和枚举。现在参数用 Zod 描述，JSON Schema 就可以生成，而且两者永远一致：**一份定义，既是给模型看的说明，也是收到参数后的检查**。

## z.toJSONSchema

```ts
const ReadFileArgs = z.object({
  path: z.string().min(1).describe("相对于工作目录的文件路径"),
  maxLines: z.number().int().min(1).max(2000).optional().describe("最多读取多少行"),
});

z.toJSONSchema(ReadFileArgs);
```

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "path": { "type": "string", "minLength": 1, "description": "相对于工作目录的文件路径" },
    "maxLines": {
      "description": "最多读取多少行",
      "type": "integer",
      "minimum": 1,
      "maximum": 2000
    }
  },
  "required": ["path"],
  "additionalProperties": false
}
```

几点对应关系：

- `.optional()` 的字段不在 `required` 里
- `.int()` 变成 `"type": "integer"`，`.min()`、`.max()` 变成 `minimum`、`maximum`（字符串上是 `minLength`、`maxLength`）
- `.describe()` 变成 `description`。`.meta({ title, description, examples })` 可以加更多信息
- `$schema` 说明用的是哪个版本的标准，发给模型 API 时通常去掉

**`description` 是写给模型的提示词。** 模型决定传什么参数，靠的就是工具和每个参数的描述。"相对于工作目录的文件路径"比"路径"有用得多，它直接决定了模型会不会传一个绝对路径进来。

## 输入还是输出？

5.3 节讲过，有了默认值和转换，一个 schema 就有输入和输出两个类型。JSON Schema 也一样：

```ts
const SearchArgs = z.object({
  query: z.string(),
  limit: z.number().int().min(1).max(50).default(10),
});

z.toJSONSchema(SearchArgs).required; //                  ["query", "limit"]
z.toJSONSchema(SearchArgs, { io: "input" }).required; // ["query"]
```

默认生成的是 **输出** 的样子：解析之后 `limit` 一定存在。但模型产生的是我们要 **解析的输入**，它可以不传 `limit`。所以给工具参数生成 JSON Schema 时，要用 `io: "input"`。

带转换的 schema 只有输入一侧能描述，输出一侧会直接报错 `Transforms cannot be represented in JSON Schema`，因为一个函数的返回值没法用 JSON 描述。

`io: "input"` 还有一个区别：普通 `z.object` 不再写 `additionalProperties: false`，因为它解析输入时会把多余的键剥掉，并不报错（5.2 节）。

## 表达不了的东西

JSON Schema 能描述的比 Zod 少。生成时有三种情况：

| Zod 里的东西                      | 生成的 JSON Schema                         |
| --------------------------------- | ------------------------------------------ |
| `refine`、`superRefine`、品牌类型 | 悄悄丢掉，只剩基础类型                     |
| 输出模式下的 `transform`          | 报错                                       |
| `z.date()`、`z.bigint()`、函数    | 报错；`unrepresentable: "any"` 时变成 `{}` |

第一种最需要注意：`min <= max` 这样的规则模型看不到。这没关系，因为收到参数后 Zod 照样会检查，只是模型可能第一次没做对，需要看到错误后重试（5.5 节）。如果一条规则很重要，把它写进 `description`，让模型提前知道。

还有一个小坑：没写范围的 `.int()` 会带上 `minimum: -9007199254740991` 和 `maximum: 9007199254740991`（安全整数的范围）。这对模型是噪音，给整数参数写上真实的范围，本来也更好。

## 复用和递归

用 `.meta({ id })` 标记的 schema，在多处使用时会放进 `$defs`，用 `$ref` 引用：

```json
{
  "properties": { "from": { "$ref": "#/$defs/City" }, "to": { "$ref": "#/$defs/City" } },
  "$defs": { "City": { "type": "string", "description": "城市名，例如「北京」" } }
}
```

递归的 schema（比如文件树）用 getter 定义，生成的 JSON Schema 里用 `$ref` 指回自己：

```ts
const FileNode: z.ZodType<FileNode> = z.object({
  name: z.string(),
  get children() {
    return z.array(FileNode);
  },
});
```

`FileNode` 的类型要先用 interface 写出来，再显式标注成 `z.ZodType<FileNode>`：一个值的推导类型依赖它自己时，TypeScript 推导不出来。类型可以引用自己（[2.4 节](../02-advanced-types/04-conditional-types.md)的 `DeepReadonly` 就是），推导却不行。getter 的作用是把对 `FileNode` 的引用推迟到用到时才求值，避免在定义完成之前就访问它。

## 严格模式

默认情况下，模型 **尽量** 按 JSON Schema 生成参数，但不保证。OpenAI 的工具定义可以加上 `"strict": true`，这时模型的输出被约束为一定符合 schema（这叫 Structured Outputs）。代价是 schema 只能用一个子集，[官方文档](https://platform.openai.com/docs/guides/structured-outputs#supported-schemas)列出的主要规则：

- 根必须是 `type: "object"`，不能是 `anyOf`
- 每个对象都必须写 `additionalProperties: false`
- **每个属性都必须在 `required` 里**
- 不支持 `allOf`、`not`、`if`/`then`/`else`、`dependentRequired`、`dependentSchemas` 等组合关键字；联合类型用 `anyOf`（支持列表里只有它，没有 `oneOf`）
- 对嵌套深度、属性总数、枚举值数量有上限

第三条最影响 schema 的写法：没有可选字段了。想表达"可以不给"，就让它 **必填但可以为 `null`**：

```ts
const StrictSearchArgs = z.object({
  query: z.string(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .nullable()
    .describe("最多返回几条，null 表示用默认值 10")
    .transform((limit) => limit ?? 10),
});
```

`.nullable()` 生成 `anyOf: [{ type: "integer", … }, { type: "null" }]`，`limit` 留在 `required` 里；`.transform` 把 `null` 换成默认值，所以工具代码拿到的 `limit` 仍然是 `number`。生成 JSON Schema 用 `io: "input"`，转换不影响生成。

联合类型也要注意：`z.discriminatedUnion` 生成的是 `oneOf`（"恰好符合其中一个"），`z.union` 生成的是 `anyOf`。严格模式下用 `z.union`：可辨识联合的各个分支本来就互斥，用 `anyOf` 表达意思不变；代价是 Zod 解析时要逐个分支尝试，出错时的信息也不如 `discriminatedUnion` 精确（5.2 节）。

第二条可以在生成时补上：`z.toJSONSchema` 的 `override` 选项会对生成的每个子 schema 调用一次，可以就地修改它：

```ts
z.toJSONSchema(StrictSearchArgs, {
  io: "input",
  override: (ctx) => {
    if (ctx.jsonSchema.type === "object" && ctx.jsonSchema.additionalProperties === undefined) {
      ctx.jsonSchema.additionalProperties = false;
    }
  },
});
```

不同厂商支持的子集不完全一样，有的还使用 OpenAPI 3.0 的写法（`z.toJSONSchema` 的 `target` 选项可以生成 `"draft-07"`、`"openapi-3.0"` 等格式）。生成之后、发给 API 之前，用代码检查一遍，比等 API 返回 400 错误再排查要好得多。这就是本节练习要做的。

## 小结

- 工具参数用 JSON Schema 描述；从 Zod 生成，保证"告诉模型的"和"实际检查的"永远一致
- 模型产生的是 schema 的输入，生成时用 `io: "input"`
- `description` 是写给模型的提示词，值得认真写
- `refine` 和品牌类型生成不出来，Zod 收到参数后仍然会检查；没写范围的 `int()` 会带上安全整数的范围
- 严格模式要求所有属性必填、对象关闭额外属性；"可选"改成 `.nullable()`，再用 `.transform` 换成默认值

## 练习

[exercises/05-validation/04-tool-schema.ts](../../exercises/05-validation/04-tool-schema.ts)：从 Zod schema 生成函数描述，检查一份 JSON Schema 是否符合严格模式，并列出每个问题的位置。运行 `pnpm ex 04-tool-schema`。

下一节：[5.5 校验模型的输出](05-model-output.md)
