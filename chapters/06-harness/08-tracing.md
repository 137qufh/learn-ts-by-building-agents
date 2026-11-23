# 6.8 追踪与日志

> 这一节要解决的问题：agent 跑了 40 秒，调用了 12 次模型、30 次工具，最后给了一个错误的答案。时间花在哪里？哪一步走错了？是模型理解错了，还是工具返回了奇怪的东西？日志里会不会不小心写进了 API key？

示例代码：[examples/08-tracing.ts](examples/08-tracing.ts)

## 从计时到追踪

[练习 4-8](../04-tooling/08-debugging-and-profiling.md) 写过一个计时器：按名字汇总每类操作的次数、总耗时、p50 和 p95。它回答的是"**平均来说**，哪类操作慢"。排查一次具体的运行，需要的是另一种信息：**这一次** 运行里，每件事在什么时候开始、花了多久、在谁的里面发生。这就是 **追踪**（tracing）：

```text
agent.run 41250ms
  step 3120ms
    model 2870ms
    tool list_files 12ms
    tool search 230ms
  step 18400ms
    model 1950ms
    tool run_tests 16420ms   ← 时间花在这里
  step ...
```

每一行是一个 **span**：一段有名字、有开始和结束时间、有属性的操作。span 可以嵌套：`step` 在 `agent.run` 里面，`model` 和 `tool` 在 `step` 里面。整次运行就是一棵 span 树。一眼就能看出：慢的不是模型，是测试命令。

这是 OpenTelemetry（可观测性领域的通用标准）的模型，几乎所有 agent 框架和 LLM 观测平台都用它。这一节写一个最小的实现，接口和它是同一个思路，以后换成 OpenTelemetry 只需要写一个适配器。

## Span 的接口

```ts
interface Tracer {
  start(name: string, options?: { parent?: Span; attributes?: Record<string, unknown> }): Span;
}

interface Span {
  readonly id: number;
  set(key: string, value: unknown): void; // 中途补充属性：结束原因、用量……
  end(): void; //                           成功结束
  fail(error: unknown): void; //            失败结束，记下错误
}
```

harness 在每个关键位置开始一个 span：

```ts
const runSpan = tracer.start("agent.run", { attributes: { maxSteps } });
const stepSpan = tracer.start("step", { parent: runSpan, attributes: { step } });
const modelSpan = tracer.start("model", { parent: stepSpan });
// ...
modelSpan.set("usage", usage);
modelSpan.end();
```

几个设计上的考虑：

**父子关系显式传递。** 每个 span 记住它的 `parent`。另一种做法是让 tracer 自动知道"当前在哪个 span 里"，这在异步代码里并不简单：两个并行的工具调用同时在运行，"当前"是哪一个？Node.js 用 `AsyncLocalStorage` 解决这个问题，它能让一个值跟着异步调用链传递，OpenTelemetry 在 Node.js 上就是用它实现自动传递的。显式传递多写几个参数，但没有任何魔法，并行的情况也一目了然。

**只结束一次。** 一个 span 被 `end` 之后又被 `fail`（比如成功之后清理代码又抛了错），以第一次为准。追踪代码不应该因为调用顺序的小问题而产生矛盾的记录。

**`noopTracer`：什么都不做的 tracer。** harness 没有配置 tracer 时用它。这样主循环里就不需要到处写 `if (tracer) ...`，追踪的代码永远存在，只是有时候什么都不记录。这叫 **空对象模式**（null object pattern）。

**时钟可以注入。** 和练习 4-8 一样，`now` 是一个参数，测试里换成固定的时钟，断言就可以精确到毫秒。

## 记录什么

span 的属性是排查问题时的线索。harness 记录：

| span        | 属性                                     |
| ----------- | ---------------------------------------- |
| `agent.run` | `maxSteps`，结束时的 `stopReason`        |
| `step`      | 第几步                                   |
| `model`     | 第几次尝试、发了几条消息、结束原因、用量 |
| `tool ...`  | 调用的 id、是否成功                      |

注意它 **没有** 记录完整的消息内容和工具参数。它们可能很大，也可能包含用户的隐私数据。需要时可以加（比如在开发环境里），但这是一个有意的决定，不应该是默认行为。

## 日志：JSON Lines

追踪要能保存下来，事后查看。最简单实用的格式是 **JSON Lines**：一行一个 JSON 对象。

```text
{"id":3,"parentId":2,"name":"model","start":12.5,"end":2883.1,"status":"ok","attributes":{"attempt":0,"finishReason":"tool_calls"}}
{"id":4,"parentId":2,"name":"tool search","start":2884.0,"end":3114.2,"status":"ok","attributes":{"id":"call_2","ok":true}}
```

为什么不是一个大的 JSON 数组？因为日志是 **追加** 的：程序可能随时崩溃，每结束一个 span 就追加一行，崩溃前写下的都还在；一个 JSON 数组在写完最后的 `]` 之前都是不完整的。JSON Lines 也很适合用命令行工具处理：`grep '"status":"error"' trace.jsonl` 就能找出所有失败的操作。

`createRecordingTracer` 的 `onEnd` 回调在每个 span 结束时调用，把它接到文件上：

```ts
const tracer = createRecordingTracer({
  onEnd: (record) => appendFileSync("trace.jsonl", toJsonLine(record) + "\n"),
});
```

## 脱敏：日志里绝不能有密钥

日志会被复制、上传、贴进 issue、发给同事。API key 一旦出现在日志里，就应该当作已经泄露了。所以写日志之前，先把敏感的值替换掉：

```ts
redact({ model: "gpt-x", headers: { Authorization: "Bearer sk-..." }, usage: { inputTokens: 10 } });
// { model: "gpt-x", headers: { Authorization: "[REDACTED]" }, usage: { inputTokens: 10 } }
```

判断一个键是不是敏感的，比看起来要难。最直觉的写法是"键名包含 token"：

```ts
/token|secret|password/i.test(key);
```

它会把 `inputTokens`、`maxTokens` 也当成密钥：用量全变成了 `[REDACTED]`，日志失去了最有用的信息。反过来，太窄的规则又会漏掉 `accessToken`、`client_secret`。练习里的规则是：转成小写、去掉 `-` 和 `_` 之后，**以** `apikey`、`token`、`secret`、`password`、`authorization`、`cookie` **结尾**。`accessToken` → `accesstoken`，以 `token` 结尾；`inputTokens` 以 `tokens` 结尾，不是。

这依然只是一个启发式的规则。更可靠的做法是 **从源头上不把密钥放进会被记录的地方**：harness 的追踪只记录它自己选定的属性，API key 只存在于客户端内部，根本不会出现在 span 里。`redact` 是第二道防线，不是第一道。

## 和事件流的关系

追踪和上一节的事件流都在描述"发生了什么"，区别在于用途：

- **事件流** 给界面，实时的、给人看的，关心的是"现在该显示什么"
- **追踪** 给排查问题的人，事后的、结构化的，关心的是"每件事的时间和因果"

它们的信息有重叠，但各自的需求会朝不同的方向发展（界面要撤回、要合并相邻的文字；追踪要采样、要上报到外部系统），所以分开设计。

## 小结

- 计时器回答"平均哪类操作慢"，追踪回答"这一次运行里每件事花了多久、在谁里面"
- span 有名字、时间、属性、状态，组成一棵树；父子关系显式传递；只结束一次；没有配置时用 `noopTracer`
- 记录有用的属性，默认不记录消息内容和参数
- 日志用 JSON Lines：可以追加、不怕崩溃、方便 grep
- 写日志前脱敏，但更重要的是从源头上不让密钥进入会被记录的地方；"包含 token"这种规则会误伤 `inputTokens`

## 练习

[exercises/06-harness/08-tracing.ts](../../exercises/06-harness/08-tracing.ts)：实现 `createRecordingTracer`（含 `tree()`）、`traced`、`isSecretKey`、`redact`、`toJsonLine`。运行 `pnpm ex 08-tracing`。

下一节：[6.9 章末项目：agent harness](09-project-harness.md)
