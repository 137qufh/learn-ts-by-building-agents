# 7.4 子 agent：委托

> 这一节要解决的问题：一个 agent 又搜又写又总结，提示越来越长，工具也越来越多。把"总结"交给另一个 agent 时，它应该看到什么，绝对不能看到什么？

示例代码：[examples/04-delegation.ts](examples/04-delegation.ts)

## 为什么要拆开，而不是把提示写长

一个 agent 什么都做，会碰到三件一起变坏的事：

- **工具变多**，模型更常选错。搜代码的工具和改文案的工具放在同一张表里，它会在不该改的时候去改
- **上下文变贵**。总结并不需要看见每一次 `grep` 的原文，可是它们都在同一条记录里，下一轮还要再发给模型
- **失败搅在一起**。总结用尽了步数，搜索也停了。两个任务的停止条件其实不该共用一个 `maxSteps`

委托的形状就是一次工具调用。父 agent 决定调用 `summarize`，harness 跑另一个 agent，把 **一段文字** 交回去。子 agent 有自己的 system 提示、自己的步数上限、自己的工具（经常是一个都没有）。它便宜、窄、好测：给它固定的输入，看它返回的那句话，不必重放父对话。

代价是多一轮模型调用，而且子 agent 看不到父对话里那些"它其实用得上"的细节。要用上的，调用方必须写进任务。这是故意的：默认隔离，显式传递。7.5 节再说哪些事实允许传。

## 不传 history，背景不要写成 system

`createAgent` 拼消息的规则是（6.9 节）：如果选项里有 `system`，而 `history` 的第一条不是 system，就把系统提示插到最前面。

```ts
if (system !== undefined && messages[0]?.role !== "system") {
  messages.unshift({ role: "system", content: system });
}
messages.push({ role: "user", content: input });
```

如果委托时把背景放进 `history` 的第一条 system 消息，这个判断会认为"已经有系统提示了"，子 agent 自己的 `system` 选项就被盖掉。专家配置的是"用一句话总结"，实际送出去的却是一段背景。所以 `delegate` 不传 `history`。背景写在用户消息里：

```ts
const input = context === undefined ? task : `背景：\n${context}\n\n任务：\n${task}`;
const run = agent.run(input, signal === undefined ? {} : { signal });
```

没有 `context` 时，用户消息就是任务本身，不要留一个空的"背景："。有 `signal` 才放进选项，不要把 `signal: undefined` 写进去。

示例把拼出来的用户消息打出来，父对话里的 `sk-secret` 留在原来的数组里，没有出现在交给子 agent 的那两行里：

```text
child system,user
背景：
买牛奶

任务：
总结购物
summary 两瓶
parent messages stayed 3
```

练习用真正的 `createAgent` 和 `createScriptedModel` 锁住这件事：子模型收到的消息只有它自己的 system 和这一次用户消息，请求数组的长度是 1，不是父对话有多长就有多长。

## 一次没做完的委托

练习里有一条把 `maxSteps` 设成 1、模型第一步就请求工具的用例。循环跑完那一步的工具，下一步发现步数用尽，不再叫模型。最后一条 assistant 只有 `tool_calls`，`content` 是 `null`。`result.text` 因此是 `""`，`stopReason` 是 `{ type: "max_steps", maxSteps: 1 }`。

`parentSummary` 看到的不是 `completed`，于是返回：

```text
子 agent 没有完成（max_steps）：（没有回答）
```

如果这里直接 `return result.text`，父模型的工具结果是空字符串。它会当成"总结就是什么都没有"，把空白写给用户。停止原因必须出现在那段文字里。`cancelled` 也一样：`signal` 在调用前就已经中止时，harness 不会抛，摘要里要有 `cancelled`。

不要为了"父模型好判断"而只返回一个布尔。父模型读的是文字。布尔要调用方自己从 `stopReason` 看，那是给程序的；`parentSummary` 是给模型的。

## 交回去的只有一段文字

`delegate` 返回四样：`text`、`messages`、`steps`、`stopReason`。`messages` 是子 agent 的完整记录，给调试和追踪。交给父模型的是 `parentSummary`：

- `stopReason.type === "completed"`：原样返回 `text`
- 否则：`子 agent 没有完成（${type}）：${text}`。`text` 为空时用 `（没有回答）`

空字符串不能当成一次成功的总结。父模型需要知道这次没做完，才不会把空白写进给用户的回答里。`max_steps` 停在工具调用那一步时，最后一条 assistant 的 `content` 是 `null`，`text` 就是空的，摘要里应该出现 `（没有回答）`。

取消也走 harness 已有的约定。`run.result` 不拒绝，`stopReason` 是 `cancelled`。把父运行的 `signal` 传进去即可。子 agent 用尽步数、被取消、模型报错，都是结果，不是抛到父循环外面的异常。父循环如果因为子 agent 抛了而停掉，已经完成的工具结果会留在一笔没修过的记录里。

不要把子 agent 的 `messages` 原样塞进父模型的工具结果。那里面有子 agent 的系统提示，可能还有它自己的工具输出。父模型的上下文会膨胀，隔离也没了。完整记录留在返回值里，谁要调试谁去看。

练习用 `createScriptedModel` 把收到的请求存下来。断言不是"返回值看起来对"，而是 `model.requests` 只有一次调用，消息是 `system` 然后 `user`，用户内容一字不差地等于拼出来的背景和任务。多传了一条父对话里的 tool 消息，长度对不上，测试会红。这比看最终的 `text` 严：文本可以对，隔离仍然是破的。

## 停下来想一想

1. 背景放在 `history: [{ role: "system", content: 背景 }]` 里，子 agent 选项里的 `system: "用一句话总结"` 还会出现在请求里吗？为什么？
2. 子 agent 因为 `max_steps` 停下，`text` 是空的。父模型的工具结果如果就是这个空字符串，它会怎么理解？

`context` 是空字符串时，条件 `context === undefined` 不成立，用户消息里仍会有"背景："和一段空白。调用方没传才是没背景。不要再用 `if (context)` 把空字符串和没传当成一回事，否则一个明确传来的空背景会被悄悄丢掉，测试如果以后钉住空字符串就对不上。当前练习用的是有内容的背景和完全不传，两种都要走对。

## 小结

- 委托是一次工具调用：子 agent 用自己的提示、步数和工具，返回一段文字
- 不传父对话。背景写在用户消息里，避免盖掉子 agent 的 system 提示
- 完整记录留给调用方。父模型只看 `parentSummary`，没完成时要带上停止原因
- 取消是 `stopReason: "cancelled"`，不是拒绝

## 练习

[exercises/07-extensions/04-delegate.ts](../../exercises/07-extensions/04-delegate.ts)：实现 `delegate` 和 `parentSummary`。运行 `pnpm ex 04-delegate`。

下一节：[7.5 交接、编排、共享上下文](05-orchestration.md)
