# 5.5 校验模型的输出

> 这一节要解决的问题：模型给出的工具参数、要求它输出的 JSON，能不能直接用？不合格的时候怎么办？

示例代码：[examples/05-model-output.ts](examples/05-model-output.ts)

模型是 agent 里最不可控的数据来源。它的输出 **看起来** 总是对的，所以最容易让人忘记校验。这一节处理模型输出的两种形式：工具调用的参数，和要求模型直接输出的结构化数据。

## 工具参数

模型调用工具时，参数是一段 **JSON 字符串**（[3.10 节](../03-async/10-project-streaming-client.md)的流式客户端把它一段段拼起来）。从字符串到可以用的参数，有两步，每一步都可能失败：

```ts
function runWeather(rawArguments: string): { content: string; isError?: true } {
  let json: unknown;
  try {
    json = JSON.parse(rawArguments);
  } catch (error) {
    return { content: `参数不是合法的 JSON：${(error as Error).message}`, isError: true };
  }
  const args = WeatherArgs.safeParse(json);
  if (!args.success) {
    return { content: `参数不符合要求：\n${z.prettifyError(args.error)}`, isError: true };
  }
  // args.data 的类型是 { city: string; unit: "celsius" | "fahrenheit" }
  return { content: `${args.data.city}：晴，25 度（${args.data.unit}）` };
}
```

注意失败时做了什么：**不抛异常，而是把错误作为工具结果返回给模型**。这是 agent 和普通程序最大的不同之一。普通程序遇到非法输入就报错退出；agent 的"调用者"是模型，它看得懂错误信息，而且大多数时候能自己改正。`city 不能为空`、`Invalid option: expected one of "celsius"|"fahrenheit"` 这样的信息，就是模型下一次调用时的依据。

所以给模型看的错误信息，要像给人看的一样认真写：

- **指出位置**：`steps[0].output` 比"参数有误"有用得多
- **说清期望**：`应该是 1 到 50 的整数`，而不只是 `invalid`
- **只说问题**：不要把整个 schema、堆栈信息塞进去，那只会浪费上下文
- **不泄漏秘密**：错误信息会进入对话记录（5.3 节的练习里，API key 绝不能出现在错误里，也是这个道理）

第 2 章的 `dispatch` 已经是这个思路（返回 `{ ok: false, error }` 而不是抛出），只是校验是手写的。5.7 节的项目会把它换成 Zod。

## 结构化输出

有时不需要调用工具，只想让模型 **按格式回答**：提取一段文字里的信息、生成一个计划、给一个分类。OpenAI 的 Chat Completions 可以在请求里带上 JSON Schema：

```ts
const body = {
  model: "gpt-5",
  messages: [{ role: "user", content: "帮我规划：给项目加上 ESLint" }],
  response_format: {
    type: "json_schema",
    json_schema: { name: "plan", strict: true, schema: z.toJSONSchema(Plan, { io: "input" }) },
  },
};
```

`strict: true` 时模型的输出被约束为符合 schema（规则见 5.4 节）。那还需要校验吗？**需要**，原因至少有这些：

- **被截断**：回答超过 `max_tokens` 时会被截断（`finish_reason` 是 `"length"`），得到半个 JSON
- **拒绝回答**：模型出于安全原因拒绝时，返回的是一段拒绝说明（`message.refusal`），不是你要的 JSON
- **schema 表达不了的规则**：`refine`、品牌类型不在 JSON Schema 里（5.4 节），模型并不知道它们
- **换了厂商或模型**：不是每个模型都支持严格模式；兼容 OpenAI 格式的服务，对 `response_format` 的支持程度也各不相同

API 承诺的是"通常会符合"，你的代码要处理的是"万一不符合"。两者之间只差一次 `safeParse`。

## 从文本里找出 JSON

不支持结构化输出的模型，只能在提示词里要求它"只输出 JSON"。它会照做，但常常顺手加上几句：

````text
好的！计划如下：
```json
{"goal":"加上 ESLint","steps":["安装依赖","写配置"]}
```
祝顺利！
````

所以解析前要先 **找出** JSON：整段是 JSON 就直接用；有 Markdown 代码块就取代码块里的内容；都没有，就从第一个 `{` 或 `[` 开始找配对的括号。找括号时要跳过字符串里的括号：`{"text": "a } b"}` 里的第一个 `}` 并不是结束。本节练习会实现它。

## 修复循环

校验失败之后，最有效的做法往往是 **把问题告诉模型，让它重来**：

```text
user:      帮我规划：给项目加上 ESLint，用 JSON 回答
assistant: {"goal":"加上 ESLint","steps":[]}
user:      你的回答有问题：
           - steps: 至少要有 1 项
           请只输出修正后的 JSON，不要有其他内容。
assistant: {"goal":"加上 ESLint","steps":["安装依赖","写配置","修复已有的问题"]}
```

要点：

- **保留模型原来的回答**：让它看到自己写了什么，比只说"错了"更容易改对
- **反馈简短具体**：路径 + 问题，和工具错误的要求一样
- **限制次数**：两三次还不对，再试大概率也不对，应该返回失败，让上层决定（换模型、问用户、放弃）
- **区分两种失败**：网络错误、限流这类 **调用** 失败，交给第 3 章的重试（[3.7 节](../03-async/07-retries.md)）；**内容** 不合格才走修复循环。两者混在一起，会对一个已经断网的连接反复"反馈"

在类型上，修复循环是一个很好的泛型练习：传入什么 schema，返回的就是什么类型。

```ts
async function generateValidated<S extends z.ZodType>(
  generate: Generate,
  prompt: string,
  schema: S,
): Promise<ValidatedResult<z.output<S>>>;
```

`S` 是 schema 本身的类型，`z.output<S>` 从中取出解析后的类型，和 [2.5 节](../02-advanced-types/05-infer.md)用 `infer` 从函数类型里取出返回值是同一个思路。调用的地方不需要写任何类型标注。

## 小结

- 工具参数要两步校验：`JSON.parse`，然后 `safeParse`；失败时把错误作为工具结果返回给模型，而不是抛出
- 给模型看的错误信息：有位置、有期望、简短、不泄漏秘密
- 用了严格模式也要校验：截断、拒绝、schema 外的规则、换了模型
- 不支持结构化输出时，先从回答里找出 JSON
- 修复循环：保留原回答、反馈问题、限制次数；调用失败和内容不合格分开处理

## 练习

[exercises/05-validation/05-repair-loop.ts](../../exercises/05-validation/05-repair-loop.ts)：从模型的回答里取出 JSON，把 Zod 的问题写成给模型看的反馈，解析工具参数，实现"生成 → 校验 → 反馈"的修复循环。运行 `pnpm ex 05-repair-loop`。

下一节：[5.6 解析 API 响应](06-api-responses.md)
