# 6.1 agent 主循环

> 这一节要解决的问题：前五章做好了模型客户端、工具注册表、Zod 工具箱，但它们还是一个个零件。"agent"到底是什么？让模型自己决定调用哪些工具、调用几次，最后给出回答，代码要怎么写？

示例代码：[examples/01-agent-loop.ts](examples/01-agent-loop.ts)

## agent 就是一个循环

[第 0 章的回声机器人](../00-setup/05-project-echo-agent.md)说过：真正的 agent 和它的结构一模一样，只是"决定怎么回应"那一步换成了模型。现在把这句话兑现：

```ts
const messages: Message[] = [{ role: "user", content: "1+2 和 3+4 各是多少？" }];

for (let step = 1; step <= maxSteps; step++) {
  const turn = await collectTurn(model.stream({ messages: [...messages], tools: tools.schemas() }));
  messages.push(assistantMessage(turn)); // 模型说的话（可能带着工具调用）

  if (turn.toolCalls.length === 0) {
    return turn.text; // 模型不再调用工具：这就是最终的回答
  }
  for (const call of turn.toolCalls) {
    const result = await tools.dispatch(call);
    messages.push({ role: "tool", tool_call_id: call.id, content: result.content });
  }
}
```

这就是整个 agent。没有魔法：**模型决定做什么，harness 去做，把结果告诉模型，再问它下一步做什么**。模型看到 `1+2` 的结果之后，可能再调用一次工具，也可能直接回答；循环会跑几次，事先谁也不知道。这和第 4 章演示程序里固定的"调用 → 执行 → 交回"不同：那是一个回合，这是任意多个回合。

**harness**（直译是"马具"）指的就是包在模型外面的这一层：它不负责"聪明"，负责把模型的决定变成真实的动作，并且保证这个过程 **可控**：不会无限循环、不会因为一个工具卡住而卡住、不会因为网络抖了一下就前功尽弃、用户随时可以喊停、出了问题能查清楚。这一章的八节，每一节解决其中一件事。

## 一个回合：从事件到消息

第 3 章的 `stream()` 交出的是事件：一段段文字（`text`）、拼好的工具调用（`tool_call`）、最后的 `finish`。循环里要把一次 `stream` 收集成一个 **回合**（turn）：

```ts
interface Turn {
  text: string;
  toolCalls: RawToolCall[];
  finishReason: string;
  usage?: Usage;
}
```

再把回合变成接口格式的 assistant 消息追加进记录。有两个细节，都是接口的要求：

- **没有文字时 `content` 是 `null`**，不是 `""`。只调用工具、不说话的回复很常见
- **工具调用要原样放回记录**（`tool_calls` 里的 `id`、名字、参数一个都不能少），随后的每条 `tool` 消息用 `tool_call_id` 指向其中一个。接口会检查这种配对：assistant 消息里有工具调用，后面却缺了某个调用的结果，下一次请求会被拒绝。6.5 节会专门处理"运行被打断，结果没来得及补上"的情况

## 为什么每次都发一份副本

```ts
model.stream({ messages: [...messages], tools });
```

`[...messages]` 看起来多余：反正发出去的请求会被序列化成 JSON。但 `Model` 是一个接口，不一定是 HTTP 客户端。下一节的假模型会把收到的请求保存下来给测试检查，如果它保存的是 `messages` 数组本身，循环后面 `push` 的消息会"穿越"回之前的请求里：测试检查第一次请求有几条消息，看到的却是最后的状态。

这是 JavaScript 里一类很常见的 bug：**数组和对象是共享的**，把一个数组交给别人，别人拿到的就是同一个数组（[1.2 节](../01-basics/02-objects-and-interfaces.md)提醒过：原对象可能还被别处引用着）。把一个之后还要修改的数组交出去，等于让别人看到你未来的修改。浅拷贝一层就够了，因为我们只会追加消息，不会修改已有的消息对象。

## harness 眼里的模型和工具

循环只需要模型能 `stream`，工具能 `schemas` 和 `dispatch`：

```ts
interface Model {
  stream(request: ChatRequest, options?: CallOptions): AsyncIterable<StreamEvent>;
}

interface ToolExecutor {
  schemas(): readonly FunctionDefinition[];
  dispatch(
    call: RawToolCall,
    options?: { signal?: AbortSignal },
  ): Promise<{ id: string; ok: boolean; content: string }>;
}
```

第 3 章的 `LlmClient` 和第 5 章的 `Toolbox` 都 **天然符合** 这两个接口，不需要任何适配。这是 TypeScript 结构化类型（[1.2 节](../01-basics/02-objects-and-interfaces.md)）的好处：接口描述的是"需要什么"，任何有这些方法的对象都能用。harness 不依赖具体的客户端和工具箱，于是：

- 测试时可以换成一个不联网、按脚本回复的假模型（下一节）
- 换一家模型服务商、换一种工具定义方式，harness 一行都不用改
- harness 不需要导入 Zod：`@learn-ts/agent-kit` 的主入口依然不依赖它（5.7 节）

`Model` 只要求 `AsyncIterable`，比 `LlmClient` 的 `AsyncGenerator` 宽松：参数类型越宽松，能接受的实现越多。

## 最朴素的停止条件

上面的循环有两种结束方式：

- 模型不再调用工具，**完成**
- 跑满 `maxSteps` 步，**被迫停下**。模型可能陷入"读文件 → 再读一遍 → 再读一遍"的循环，也可能任务本身太大。没有上限的循环迟早会烧掉你的预算

`maxSteps` 数的是 **调用模型的次数**，不是工具调用的次数：一步里可以有好几个工具调用。到达上限时，最后一步的工具已经执行完、结果已经追加进记录，所以记录依然是完整的，可以接着用。

这还远远不够：`finish_reason` 是 `length`（输出被截断）怎么办？模型一遍遍发出同样的调用怎么办？6.5 节会补全停止条件。

## 一个一个执行，还是一起执行

练习里，同一步的多个工具调用是 **按顺序** 一个一个执行的。示例里模型同时要求计算 `1+2` 和 `3+4`，两个调用互不相关，完全可以同时进行。为什么先写成顺序的？因为这是最容易写对的版本。6.3 节会把它换成并行执行，同时处理超时和取消，那时你会发现"写对"并不简单。

## 小结

- agent = 一个循环：模型决定 → harness 执行工具 → 结果追加进记录 → 再问模型，直到模型不再调用工具
- 一次 `stream` 收集成一个回合；assistant 消息原样带上工具调用，每个调用都要有一条 `tool` 消息回应
- 交给别人的数组要给副本，否则之后的修改会"穿越"到别人保存的引用里
- harness 只依赖 `Model` 和 `ToolExecutor` 两个结构化接口，客户端和工具箱天然符合，测试时可以换成假的
- `maxSteps` 限制调用模型的次数，是防止无限循环的最后一道保险

## 练习

[exercises/06-harness/01-agent-loop.ts](../../exercises/06-harness/01-agent-loop.ts)：实现 `collectTurn`、`assistantMessage` 和最朴素的 `runAgentLoop`。运行 `pnpm ex 01-agent-loop`。

下一节：[6.2 脚本化的假模型：确定性测试](02-scripted-model.md)
