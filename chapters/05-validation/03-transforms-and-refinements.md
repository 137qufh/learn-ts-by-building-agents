# 5.3 转换与细化

> 这一节要解决的问题："min 不能大于 max"、"工具调用的 id 不能重复"这样的规则，类型表达不了，schema 怎么检查？环境变量是字符串，工具参数是一段 JSON 文本，怎么在校验的同时把它们变成需要的类型？

示例代码：[examples/03-transforms-and-refinements.ts](examples/03-transforms-and-refinements.ts)

上一节的 schema 只回答"是不是"。这一节的工具让 schema 能 **检查更多** 和 **顺便转换**，这正是上一节"解析，而不是验证"的第 3 点。

## 细化：refine 和 superRefine

```ts
const Range = z
  .object({ min: z.number(), max: z.number() })
  .refine((range) => range.min <= range.max, { message: "min 不能大于 max", path: ["min"] });
```

`refine` 接收一个返回 `boolean` 的函数，返回 `false` 时报告一个 `code` 为 `"custom"` 的问题。`path` 指定问题报告在哪个位置，不写就是 schema 自己的位置。

有一个容易忽略的细节：**字段本身不合法时，对象上的 `refine` 不会运行**。看 `refine` 回调的参数类型：`{ min: number; max: number }`。如果 `min` 是字符串，这个类型就是假的，所以 Zod 只在基础校验全部通过后才运行细化。结果是，用户第一次只看到"min 应该是数字"，改好之后才看到"min 不能大于 max"。

需要报告多个问题、或者每个问题位置不同时，用 `superRefine`，通过 `ctx.addIssue` 自己报告：

```ts
z.array(ToolCall).superRefine((calls, ctx) => {
  const seen = new Set<string>();
  calls.forEach((call, index) => {
    if (seen.has(call.id)) {
      ctx.addIssue({ code: "custom", message: `重复的 id：${call.id}`, path: [index, "id"] });
    }
    seen.add(call.id);
  });
});
```

细化适合 **数据内部的一致性**：范围、唯一性、"tool 消息必须对应前面某个工具调用"。需要访问外部世界的检查（文件存不存在、用户有没有权限）不要放进 schema：schema 应该是同步的、纯的，它回答的是"这份数据的形状对不对"。

## 转换：transform

```ts
const Csv = z.string().transform((text) => text.split(",").map((part) => part.trim()));
Csv.parse("search, read_file"); // ["search", "read_file"]
```

`transform` 在校验通过后对值做变换，`parse` 返回变换后的结果。变换本身也可能失败，比如解析 JSON：

```ts
const JsonText = z.string().transform((text, ctx): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    ctx.addIssue({ code: "custom", message: "不是合法的 JSON" });
    return z.NEVER;
  }
});
```

`z.NEVER` 的类型是 `never`，返回它表示"这里已经报告了问题，没有结果"，不会影响推导出的类型。

## 管道：pipe

`a.pipe(b)` 先用 `a` 校验（和转换），再把结果交给 `b`：

```ts
const WeatherArgs = JsonText.pipe(z.object({ city: z.string().min(1) }));
WeatherArgs.parse('{"city":"北京"}'); // { city: "北京" }
```

这正是处理模型工具调用的形状：参数是一段 JSON **字符串**，要先解析，再校验结构。一个 schema 就把两步都做了，任何一步出错都变成统一的 Zod 问题。

## 输入类型和输出类型

有了转换，一个 schema 就有了两个类型：它 **接受** 什么，和它 **产出** 什么：

```ts
z.input<typeof WeatherArgs>; //  string
z.output<typeof WeatherArgs>; // { city: string }
```

`z.infer` 就是 `z.output`。`.default()` 也会让两者不同：

```ts
const WithDefault = z.object({ retries: z.number().int().default(3) });
z.input<typeof WithDefault>; //  { retries?: number | undefined }
z.output<typeof WithDefault>; // { retries: number }
```

大多数时候你关心的是输出类型。需要描述"调用方可以传什么"时（比如函数的选项参数），用 `z.input`。

## coerce 和 preprocess：小心

`z.coerce.number()` 先对输入调用 `Number(...)`，再校验。读环境变量、URL 查询参数时很方便，但 `Number` 的规则有坑：

```ts
const Num = z.coerce.number();
Num.parse("42"); // 42
Num.parse(""); //   0     ← 空字符串变成了 0
Num.parse(null); // 0
Num.parse("abc"); // 报错：NaN 不算数字
```

`AGENT_MAX_RETRIES=`（设置了但为空）会被当成 0 次重试，而不是"没设置，用默认值"。解决办法是在 coerce 之前先把空白值变成 `undefined`，`z.preprocess` 让你在校验之前对原始输入做一次处理：

```ts
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

z.preprocess(blankToUndefined, z.coerce.number().int().default(3));
```

布尔值更糟：`Boolean("false")` 是 `true`。环境变量里的布尔值用 `z.stringbool()`，它认识 `true`/`false`、`1`/`0`、`yes`/`no`、`on`/`off` 等写法，其他的报错。

还有一个坑：`z.url()` 默认接受任何协议，`"localhost:3000"` 会被当成"协议为 `localhost`"的合法 URL。需要 HTTP 地址时，加上 `z.url({ protocol: /^https?$/ })`。

## 品牌类型

```ts
const ToolCallId = z.string().regex(/^call_\w+$/).brand<"ToolCallId">();
type ToolCallId = z.infer<typeof ToolCallId>;

function findResult(id: ToolCallId) { ... }
findResult(ToolCallId.parse("call_1")); // ✅
findResult("call_1"); // ❌ 普通字符串不能冒充
```

`.brand()` 只在类型上给 `string` 加一个看不见的标记，运行时什么都不做。效果是：**只有经过这个 schema 的值才是 `ToolCallId`**。函数参数写成 `ToolCallId`，就等于要求"调用者必须先校验过"，忘了校验会是一个编译错误。

API key、已经校验过的路径、用户 ID，都适合用品牌类型。它把"这个值检查过了"这个事实记录进了类型系统，是"解析而不是验证"的又一种体现。

## catch：兜底的值

```ts
const Temperature = z.number().min(0).max(2).catch(1);
Temperature.parse(5); // 1
```

`.catch(值)` 让校验失败时返回一个兜底的值，而不是报错。它适合"有一个合理的默认，而且错了也无所谓"的场合，比如解析一份不重要的偏好设置。不要在工具参数和模型输出上用它：把错误悄悄吞掉，模型永远不知道自己错了（5.5 节）。

## 小结

- `refine` 检查类型表达不了的规则；它只在基础校验通过后运行。多个问题、自定义位置用 `superRefine`
- `transform` 在校验后变换值，失败时 `ctx.addIssue` 并返回 `z.NEVER`；`pipe` 把多个步骤串起来
- 有转换或默认值时，`z.input` 和 `z.output` 不同；`z.infer` 是输出类型
- `z.coerce.number()` 把空字符串和 `null` 变成 0；用 `z.preprocess` 先处理空白值。布尔值用 `z.stringbool()`，URL 限定协议
- 品牌类型让"校验过"成为类型的一部分
- `.catch` 吞掉错误，只用在错了也无所谓的地方

## 练习

[exercises/05-validation/03-env-config.ts](../../exercises/05-validation/03-env-config.ts)：把环境变量解析成 agent 的配置：默认值、空白值、整数范围、布尔值、URL、品牌类型的 API key，以及一个不会泄漏 key 的配置摘要。运行 `pnpm ex 03-env-config`。

下一节：[5.4 JSON Schema：给模型看的 schema](04-json-schema.md)
