# 5.6 解析 API 响应

> 这一节要解决的问题：第 3 章的客户端用 `as ChatChunk` 读服务器的响应。换成 Zod 之后，该多严格？服务商加了新字段、新的枚举值，或者换了一家写法略有不同的服务商，代码会不会突然坏掉？

示例代码：[examples/06-api-responses.ts](examples/06-api-responses.ts)

5.5 节校验的是模型 **生成的内容**；这一节校验的是 API **本身的响应**：流式的数据块、用量、错误。它们由服务商的代码生成，格式比模型的输出可靠得多。但"可靠"不等于"不变"，也不等于"每家都一样"。

## 宽容地读，严格地用

```ts
const Usage = z.object({ prompt_tokens: z.number().int(), completion_tokens: z.number().int() });

Usage.parse({
  prompt_tokens: 100,
  completion_tokens: 20,
  total_tokens: 120,
  prompt_cache_hit_tokens: 64,
});
// { prompt_tokens: 100, completion_tokens: 20 }
```

DeepSeek 的用量里有 `prompt_cache_hit_tokens`，OpenAI 没有；明年 OpenAI 可能又加一个新字段。`z.object` 忽略不认识的键（5.2 节），所以这些都不会让解析失败。这就是解析外部 API 的基本原则：

- **用到的字段，严格检查**：`prompt_tokens` 必须是整数，不是就报错。宁可在解析时失败，也不要让一个 `undefined` 混进计费逻辑
- **没用到的字段，不去检查**：不写进 schema，它变成什么样都和你无关
- **不要用 `z.strictObject`**：它会因为一个新字段就拒绝整个响应。`strictObject` 适合你自己控制的输入（配置文件、工具参数），不适合别人控制的输出

这条原则有个老名字，叫"宽容读者"（Tolerant Reader）：对收到的东西宽容，只依赖真正需要的部分。

## 新的枚举值

```ts
const Closed = z.enum(["stop", "length", "tool_calls"]);
Closed.safeParse("insufficient_system_resource").success; // false
```

`finish_reason` 看起来是个封闭的集合，但服务商会增加新的值。DeepSeek 在资源不足时返回 `"insufficient_system_resource"`，OpenAI 有 `"content_filter"`，以后还会有别的。用封闭的 `z.enum`，一个新值就会让整个响应解析失败，而这本来只是一个"不太常见的结束原因"。

两种处理方式：

```ts
// 1. 认识的值保留，其他值归为 "other"
const FinishReason = Closed.or(z.string().transform(() => "other" as const));
// 类型："stop" | "length" | "tool_calls" | "other"

// 2. 只在类型上开放
type OpenFinishReason = "stop" | "length" | "tool_calls" | (string & {});
```

第一种让后续代码可以穷尽地处理每一种情况（[1.6 节](../01-basics/06-unions-and-narrowing.md)的 `never` 检查），代价是丢掉了原始的值；需要记日志时可以另外保留一份。第二种是一个类型技巧：`string & {}` 和 `string` 接受的值一样，但 TypeScript 不会把它和字面量类型合并成 `string`，所以编辑器还能补全 `"stop"` 这些认识的值。

## 缺少和 null

同一个"没有值"，有两种写法：省略这个字段，或者写成 `null`。即使是同一家服务商，两种写法也会混着用：OpenAI 在第一个块之后通常省略 `role`；开启 `include_usage` 后，中间的块里 `usage` 是 `null`，而不是省略；只有工具调用的块里，`content` 可能是 `null`。兼容 OpenAI 格式的其他服务，选择又各不相同。`.nullish()` 两种都接受：

```ts
const Delta = z.object({ content: z.string().nullish() });
Delta.parse({}); //                  {}
Delta.parse({ content: null }); //   { content: null }
```

推导出的类型是 `content?: string | null | undefined`，用的时候写 `delta.content ?? ""` 或者 `if (delta.content)` 就能同时处理两种情况。不需要在 schema 里把 `null` 转成 `undefined`：多一次转换，就多一处要测试的代码。

## 同一个字段的两种形状

有些字段有不止一种形状。消息的 `content` 可能是字符串，也可能是一组内容块（多模态的消息、Anthropic 的 API、OpenAI 的 Responses API 都是这样），还可能是 `null`（只有工具调用时）。用 `union` 接受所有形状，再用 `transform` 统一成代码里用的那一种：

```ts
const Content = z
  .union([z.string(), z.array(z.union([TextPart, OtherPart])), z.null()])
  .transform((content) => {
    if (content === null || typeof content === "string") {
      return content ?? "";
    }
    return content.map((part) => ("text" in part ? part.text : "")).join("");
  });
```

这是"解析而不是验证"（5.1 节）的又一个例子：形状的差异在边界上处理掉，后面的代码只需要面对一个 `string`。

## 错误响应

```ts
const body = ErrorBody.safeParse(json);
return body.success
  ? `${status}：${body.data.error.message}`
  : `${status}：${bodyText.slice(0, 100)}`;
```

服务出错时，响应体的格式最不可靠：可能是标准的 `{ "error": { "message": … } }`，也可能是网关返回的一段 HTML。这时 **解析失败不能掩盖原来的错误**：用户需要知道的是"502，网关出错了"，而不是"无法解析响应"。所以错误响应用 `safeParse`，失败就退回到状态码和原始文本。第 3 章的 `errorFromResponse` 也是这么做的，只是没用 schema。

## 性能

流式响应里每个 token 一个数据块，一次回答可能有上千个，每个都要解析。值得担心吗？

示例的最后测了一下：`JSON.parse` 加 Zod 校验，每个块几微秒。而网络上等一个 token 通常要几十毫秒，差了上千倍。正如 [4.8 节](../04-tooling/08-debugging-and-profiling.md)说的：先测量，再优化。在 agent 里，模型的延迟几乎总是瓶颈，校验不是。

## 小结

- 解析别人的 API：用到的字段严格检查，没用到的不检查；不要用 `strictObject`
- 枚举会增加新值：未知的值归为 `"other"`，或者在类型上用 `(string & {})` 保持开放
- `.nullish()` 同时接受缺少和 `null`
- 字段有多种形状时，`union` 接受、`transform` 统一
- 错误响应的解析失败不能掩盖原来的错误
- 校验的开销和模型延迟相比可以忽略，先测量再说

## 练习

[exercises/05-validation/06-chunk-schema.ts](../../exercises/05-validation/06-chunk-schema.ts)：给第 3 章流式客户端的数据块写 Zod schema，替换掉 `parseChunk` 里的 `as`：用到的字段严格、多余的字段忽略、缺少和 `null` 都接受、新的 `finish_reason` 不会让流失败。运行 `pnpm ex 06-chunk-schema`。

下一节：[5.7 章末项目：用 Zod 定义工具](07-project-zod-tools.md)
