# 6.6 事件流：给界面的流式事件

> 这一节要解决的问题：agent 一次运行可能要几十秒。这段时间里，界面要一个字一个字地显示模型的输出，显示正在执行哪个工具、哪个工具先完成了、哪一步在重试。harness 怎么把"正在发生的事"交给界面，又不和任何一种界面（终端、网页、Slack 机器人）绑死？

示例代码：[examples/06-event-stream.ts](examples/06-event-stream.ts)

## 事件，而不是回调参数

最直接的办法是让调用方传一堆回调：`onText`、`onToolCall`、`onToolResult`……每加一种事件，`createAgent` 的选项就多一个，调用方也要一个个对应着写。更好的办法是把"发生的事"统一成一个 **事件** 的可辨识联合：

```ts
type AgentEvent =
  | { type: "step_start"; step: number }
  | { type: "text"; step: number; text: string }
  | { type: "tool_call"; step: number; call: RawToolCall }
  | { type: "tool_result"; step: number; result: ToolRun }
  | { type: "step_retry"; step: number; attempt: number; error: Error }
  | { type: "context_trimmed"; step: number; dropped: number; tokens: number }
  | { type: "model_end"; step: number; finishReason: string; usage?: Usage }
  | { type: "done"; result: AgentResult };
```

然后让运行本身成为一个可以 `for await` 的东西：

```ts
const run = agent.run("帮我看看有哪些 TODO");
for await (const event of run) {
  if (event.type === "text") process.stdout.write(event.text);
}
const result = await run.result;
```

和第 3 章的 `stream()` 是同一个思路：一次运行就是一串按时间顺序到达的事件。好处是：

- **和界面无关**：终端把 `text` 写到标准输出，网页把事件通过 SSE 推给浏览器，测试把事件收集成数组再断言。harness 一行都不用改
- **容易扩展**：加一种事件只是给联合加一个成员；不关心它的调用方什么都不用改
- **顺序明确**：所有事件在同一个序列里，"先显示调用，再显示结果"是自然成立的

`run.result` 是最终结果的 Promise：只关心结果、不关心过程的调用方，直接 `await run.result`，完全不用碰事件。

### step_retry：界面也要恢复

上一节说过，流中途出错时 harness 会把这一步整个重来。但这一步的文字已经通过 `text` 事件显示出去了。`step_retry` 事件告诉界面："这一步刚才显示的文字作废了"。终端可以打印一行说明，网页可以把那段文字删掉。如果没有这个事件，用户会看到同一段话的前半句出现两次，却不知道为什么。

**事件流要能表达"撤回"**，这是流式界面和"一次性返回结果"最大的不同。

## 从"推"到"拉"：通道

harness 的主循环是"推"：发生一件事，就 `emit(event)`。调用方是"拉"：`for await` 一个一个地取。两边的节奏不一样，模型可能一下子吐出十段文字，而界面正忙着渲染上一段。中间需要一个缓冲：**通道**（channel）。

```ts
const channel = createChannel<AgentEvent>();
channel.push(event); // 生产者：放进缓冲区，唤醒正在等待的消费者
channel.close(); //     生产者：没有更多了
for await (const event of channel) { ... } // 消费者：取完缓冲区，没有就等
```

实现的核心是一个缓冲数组和一个"唤醒"函数：

```ts
async function* iterate() {
  while (true) {
    if (buffer.length > 0) {
      yield buffer.shift()!;
      continue;
    }
    if (closed) return;
    await new Promise<void>((resolve) => {
      wake = resolve;
    }); // 等 push 或 close 叫醒我
  }
}
```

消费者没有东西可取时，创建一个 Promise，把它的 `resolve` 存起来，`await` 在那里；生产者 `push` 时调用存起来的 `resolve`，消费者就醒了。这是 [3.2 节](../03-async/02-promises.md) `withResolvers` 那种"在一个地方创建，在另一个地方完成"的典型用法。

还有几个边界情况：

- **消费者提前离开**：调用方在 `for await` 里 `break` 了。异步生成器的 `finally` 会执行（[3.8 节](../03-async/08-async-iterators.md)），在那里标记"消费者已经离开"、清空缓冲区，之后的 `push` 直接丢弃，不会无限地堆积
- **只能遍历一次**：两个消费者从同一个通道取值，每个事件只会被其中一个拿到，几乎一定是 bug。第二次遍历直接报错，比悄悄地分走一半事件好得多
- **没有人遍历**：值一直缓冲着。agent 的事件数量有限（一次运行几百到几千个），这没问题；如果是无限的数据流，就需要有上限的缓冲区和"背压"（让生产者等一等），那是另一个话题了

### harness 不等消费者

`agent.run()` 立刻开始运行，不等有人遍历事件。另一种设计是"有人拉才运行"（就像生成器，不调用 `next()` 就什么都不做）。这一章选择前者，因为调用方可能只关心 `run.result`，根本不遍历事件；如果运行要等消费者，这种用法就会永远卡住。代价是事件会在缓冲区里堆积，正如上面说的，对 agent 来说这完全可以接受。

## 给事件处理函数精确的类型

调用方常常想按类型注册处理函数：

```ts
dispatchEvent(event, {
  text: (e) => process.stdout.write(e.text), //       e 的类型是 text 事件，直接用 e.text
  tool_result: ({ result }) => console.log(result.name),
});
```

处理函数的参数要是 **那一种** 事件，这样就不用在每个函数里再收窄一次。用 [2.3 节](../02-advanced-types/03-mapped-types.md)的映射类型和 [2.7 节](../02-advanced-types/07-utility-types.md)的 `Extract`：

```ts
type EventOf<K extends AgentEvent["type"]> = Extract<AgentEvent, { type: K }>;
type EventHandlers = { [K in AgentEvent["type"]]?: (event: EventOf<K>) => void };
```

`EventOf<"text">` 从联合里取出 `type` 是 `"text"` 的那个成员。`EventHandlers` 为每种事件生成一个可选的属性，参数类型各不相同。

实现 `dispatchEvent` 时会遇到 [2.8 节](../02-advanced-types/08-debugging-type-errors.md)的老朋友：

```ts
function dispatchEvent(event: AgentEvent, handlers: EventHandlers) {
  handlers[event.type]?.(event); // ❌ 参数类型是 never
}
```

`handlers[event.type]` 的类型是"text 的处理函数 **或** tool_call 的处理函数 **或**……"，调用它要求参数同时满足所有事件，交叉的结果是 `never`。TypeScript 不知道 `event.type` 和 `event` 是配对的，这就是 **关联的联合**。修复的办法也和 2.8 节一样，以"键"为类型参数：

```ts
function dispatchEvent<K extends AgentEvent["type"]>(event: EventOf<K>, handlers: EventHandlers) {
  handlers[event.type]?.(event); // ✅ 两边是同一个 K
}
```

第 1 章项目的结尾说过，第 6 章会用第 2 章学的类型运算让聊天记录的模型"更通用、更精确"。这就是一个例子：事件、消息、工具调用，都是"一个 `type` 字段决定其余字段"的可辨识联合，`Extract` 和映射类型让我们按名字精确地取出其中一种。

## 小结

- 把"发生的事"统一成事件的可辨识联合，运行本身可以 `for await`；`result` 给只关心结果的调用方
- 事件流要能表达撤回：`step_retry` 告诉界面丢掉这一步已经显示的文字
- 通道连接"推"和"拉"：缓冲区 + 存起来的 `resolve`；消费者离开后丢弃新的值；只能遍历一次
- harness 立刻开始运行，不等消费者
- `Extract` + 映射类型给处理函数精确的参数类型；`dispatchEvent` 用以键为类型参数的泛型解决关联的联合

## 练习

[exercises/06-harness/06-event-stream.ts](../../exercises/06-harness/06-event-stream.ts)：写出 `EventOf`、`EventHandlers`（含类型测试），实现 `dispatchEvent` 和 `createChannel`。运行 `pnpm ex 06-event-stream`。

下一节：[6.7 钩子与中间件](07-middleware.md)
