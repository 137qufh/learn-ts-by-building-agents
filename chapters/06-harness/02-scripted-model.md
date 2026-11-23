# 6.2 脚本化的假模型：确定性测试

> 这一节要解决的问题：harness 的每一个分支（工具失败、超时、流中途断开、用户取消、模型陷入重复）都要测试。真的模型又慢又贵，每次回答还不一样，而且你没法让它"在第三个字之后断开连接"。怎么写出又快又稳定、能精确制造各种情况的测试？

示例代码：[examples/02-scripted-model.ts](examples/02-scripted-model.ts)

## 两层假模型

第 3 章已经有一个假的 OpenAI 服务器：它是一个和 `fetch` 签名相同的函数，按剧本返回 HTTP 响应和 SSE 数据流。用它测试 **客户端** 正合适，因为客户端要处理的正是 HTTP 状态码、`Retry-After`、分段到达的数据。

测试 **harness** 时，这些都是噪音。harness 只和 `Model` 接口打交道（上一节），它关心的是"模型这一步说了什么、调用了什么工具"。所以这一节写第二种假模型，直接实现 `Model`：

| 假的是什么                              | 适合测试                  | 不适合                                   |
| --------------------------------------- | ------------------------- | ---------------------------------------- |
| `fetch`（第 3 章 `createFakeOpenAI`）   | 客户端：HTTP、SSE、重试   | harness：要写一堆 SSE 细节，和要测的无关 |
| `Model`（这一节 `createScriptedModel`） | harness：循环、工具、恢复 | 客户端：根本没经过它                     |

两种都放进了 `@learn-ts/agent-kit/testing`。分层测试的原则是：**在你要测的那一层的正下方造假**。造假的位置越低，测试越"真实"，但要准备的细节越多、越脆弱。

## 脚本

```ts
const model = createScriptedModel([
  { text: "我查一下", toolCalls: [{ name: "read_file", arguments: { path: "a.ts" } }] },
  { fail: new Error("连接断开"), afterText: "说到一半" },
  (request) => ({ text: `收到 ${request.messages.length} 条消息` }),
]);
```

每调用一次 `stream`，消费脚本里的一步。一步可以是：

- **一个回复**：文字、工具调用、结束原因、用量。工具调用的参数可以直接写对象，id 默认自动编号（`call_1`、`call_2`……），测试里就不用到处手写 JSON 字符串和 id
- **一次失败**：先交出一段文字，再抛出指定的错误。这正是"流到一半网络断了"，真的模型很难让你稳定复现它
- **一个函数**：根据收到的请求决定回复。测试"模型看到了工具的错误信息之后改正参数"这类交互时很有用

文字会被切成几个字一段的多个 `text` 事件，模拟流式输出；`delayMs` 让每个事件之前等一会儿，用来测试"输出到一半时取消"。

### 编号为什么是整个脚本的

工具调用的默认 id 在整个脚本里递增，而不是每一步都从 `call_1` 开始。真实的接口保证 id 唯一，harness 也可能依赖这一点（6.5 节的 `repairHistory` 就是按 id 配对的）。如果假模型每一步都发出 `call_1`，测试里会出现真实世界不会出现的情况，测出来的不是你的 bug，而是假模型的 bug。**假的东西也要遵守真东西的约定**。

## 记录请求：要副本

```ts
requests.push(structuredClone(request));
```

假模型把收到的请求记下来，测试就可以检查"第二次请求里有没有带上工具的结果"。上一节说过，harness 应该发副本；但假模型不能假设调用方一定这么做，所以它自己再复制一份，而且是 **深拷贝**。

`structuredClone` 是一个全局函数，按"结构化克隆算法"复制一个值：对象、数组、`Map`、`Set`、`Date` 都会被递归地复制。它不能复制函数和类的原型（得到的是普通对象），不过请求只是普通的数据，正合适。

## 取消也要模拟

```ts
signal?.throwIfAborted(); // 开始之前
await abortableSleep(delayMs, signal); // 每个事件之前（第 3 章）
```

真实的客户端在取消时会立刻停下，抛出 `signal.reason`。假模型也必须这样做，否则测试"取消"的时候，假模型照样把整段回复交出来，你测到的是一个不存在的世界。这又是那条原则：**假的东西要和真东西一样遵守约定**，尤其是错误和取消这类边界行为。

## 确定性

用这个假模型写的测试，每次运行的结果完全一样：

- 模型的回复是写死的
- 唯一的"时间"来自 `delayMs`，而且只在测试取消时才用（几毫秒）
- 工具也可以是假的（测试里一个对象就够了，见 6.9 节的测试）

[4.6 节](../04-tooling/06-testing.md)说过：时而红时而绿的测试比没有测试还糟，因为大家会学会无视它。确定性的测试还有一个好处：失败时一定能复现。

## 用测试描述行为

有了假模型，harness 的每一种行为都可以写成一个短小的测试，例如"流中途出错时整步重试"：

```ts
const model = createScriptedModel([
  { fail: new Error("连接断开"), afterText: "说到" },
  { text: "完整的回答" },
]);
const result = await createAgent({ model }).run("go").result;

expect(result.messages.at(-1)).toEqual({ role: "assistant", content: "完整的回答" });
expect(model.requests).toHaveLength(2);
```

两行脚本，就精确地制造出了真实世界里很难复现的情况。这一章后面每一节的行为，都会在 6.9 节的测试里这样验证。

> 测试 agent 的另一半是测试模型本身的表现："给它这个任务，它会不会选对工具"。那是 **评测**（eval），要用真的模型跑很多次、统计成功率，和这里的单元测试是两回事。单元测试保证 harness 在任何回复下都行为正确；评测衡量模型配上你的提示和工具，能把任务做得多好。

## 小结

- 在要测的那一层的正下方造假：测客户端假 `fetch`，测 harness 假 `Model`
- 脚本的每一步是一个回复、一次失败或者一个看请求做决定的函数；工具调用的 id 在整个脚本里唯一
- 记录请求用 `structuredClone` 深拷贝；取消时和真的客户端一样立刻抛出 `signal.reason`
- 假的东西要遵守真东西的约定，尤其是 id 唯一、错误、取消这些边界行为
- 单元测试验证 harness 的逻辑，评测衡量模型的表现，两者互不替代

## 练习

[exercises/06-harness/02-scripted-model.ts](../../exercises/06-harness/02-scripted-model.ts)：实现 `createScriptedModel`。运行 `pnpm ex 02-scripted-model`。

下一节：[6.3 并行执行工具：超时与取消](03-parallel-tools.md)
