# 7.4 子 agent：委托

> 这一节要解决的问题：一个 agent 又搜又写又总结，提示越来越长，工具也越来越多。把"总结"交给另一个 agent，它应该看到什么，不该看到什么？

示例代码：[examples/04-delegation.ts](examples/04-delegation.ts)

## 子 agent 是一次调用，不是共享的大脑

委托的形状就是一个工具：父 agent 决定调用 `summarize`，harness 跑另一个 agent，把一段文字交回去。子 agent 有自己的 system 提示、自己的步数上限、自己的工具（经常是没有工具）。它便宜、窄、好测。

它不应该看到父对话。父对话里有工具结果、有别的用户的内容、有时还有不该扩散的字符串。子 agent 的输入只有两样：它自己的 system 提示，和这一次的任务。

```ts
const input = context === undefined ? task : `背景：\n${context}\n\n任务：\n${task}`;
const run = agent.run(input, signal === undefined ? {} : { signal });
```

不传 `history`。`createAgent` 发现第一条不是 system，就会把自己的 `system` 选项加在前面。背景如果塞进 history 的第一条 system 消息，这条判断会认为"已经有系统提示了"，专家自己的提示就被盖掉。所以背景写在用户消息里，系统提示留给 agent 的配置。

示例把拼出来的用户消息打出来。密钥留在父对话的数组里，没有出现在交给子 agent 的那两行里。

## 交回去的只有一段文字

`delegate` 返回 `text`、`messages`、`steps`、`stopReason`。`messages` 是子 agent 的完整记录，给调试和追踪用。交给父模型的是 `parentSummary`：正常完成时就是那段回答；没完成时带上停止原因，例如 `子 agent 没有完成（max_steps）：（没有回答）`。父模型需要知道这次没做完，而不是把空字符串当成一个成功的总结。

取消也走 harness 已有的约定：`run.result` 不会拒绝，`stopReason` 是 `cancelled`。把父运行的 `signal` 传进去就行。子 agent 用尽步数、被取消、模型报错，都是结果，不是抛到父循环外面的异常。

## 小结

- 委托是一次工具调用：子 agent 用自己的提示和步数，返回一段文字
- 不传父对话。背景写在用户消息里，避免盖掉子 agent 的 system 提示
- 完整记录留给调试。父模型只看 `parentSummary`
- 取消和步数上限都是 `stopReason`，不是拒绝

## 练习

[exercises/07-extensions/04-delegate.ts](../../exercises/07-extensions/04-delegate.ts)：实现 `delegate` 和 `parentSummary`。运行 `pnpm ex 04-delegate`。

下一节：[7.5 交接、编排、共享上下文](05-orchestration.md)
