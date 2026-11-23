# 6.3 并行执行工具：超时与取消

> 这一节要解决的问题：模型一次请求了读三个文件、搜索一次代码，四个调用互不相关，一个一个执行太慢。并行执行时，其中一个工具卡住了怎么办？用户在工具执行到一半时按了 Ctrl+C 怎么办？怎么保证无论发生什么，这一步都会在可预期的时间内结束，并且每个调用都有一个结果？

示例代码：[examples/03-parallel-tools.ts](examples/03-parallel-tools.ts)

## 模型会并行地请求工具

现在的模型在一次回复里请求多个工具调用是常态（OpenAI 的接口里这叫 parallel tool calls，默认开启）。模型这样做，是因为它判断这几个调用 **互不依赖**：读 `a.ts` 不需要先知道 `b.ts` 的内容。harness 如果一个一个执行，等于把模型规划好的并行又变回了串行。

[3.3 节](../03-async/03-async-await.md)和 [3.5 节](../03-async/05-concurrency.md)已经写过几种执行方式：顺序、`Promise.all`、限制并发数。harness 用的是最后一种，再加上三个要求：

1. **结果按调用的顺序** 追加进聊天记录，不管谁先完成。顺序不确定的记录会让测试不稳定，也会让同样的输入得到不同的请求
2. **每个调用有自己的超时**：一个卡住的工具不能拖住整个 agent
3. **整体可以取消**：用户喊停，这一步就要立刻结束

最后还有一条贯穿始终的约定：**永远不拒绝、永远不卡住、每个调用恰好一个结果**。工具出错是"预料之中"的（[3.4 节](../03-async/04-error-handling.md)），它的错误要变成给模型看的文字，而不是让整个循环崩溃。

## 结果的形状

```ts
type ToolStatus = "ok" | "error" | "timeout" | "cancelled";

interface ToolRun {
  id: string;
  name: string;
  ok: boolean;
  content: string; // 交给模型看的文字
  status: ToolStatus;
  durationMs: number;
}
```

`ok` 和 `content` 是给模型的：模型只需要知道成没成功、发生了什么。`status` 和 `durationMs` 是给 harness 自己和界面的：超时和取消在模型眼里都是"没成功"，但界面要显示不同的图标，追踪要统计不同的数字。

## 超时：不等它自己停下

每个调用一个自己的 `AbortController`，和外面的 `signal` 合并后传给工具：

```ts
const own = new AbortController();
const callSignal = signal === undefined ? own.signal : AbortSignal.any([signal, own.signal]);
const timer = setTimeout(() => {
  own.abort(new DOMException(`工具 ${name} 超过 ${timeoutMs}ms 没有完成，已停止`, "TimeoutError"));
  finish(index, { ok: false, status: "timeout", content: "..." }); // 立刻给出结果
}, timeoutMs);
```

关键在 `finish` 是 **立刻** 调用的，不等工具响应取消信号。[3.6 节](../03-async/06-cancellation.md)讲过：`signal` 要一层层传下去，漏传一处，那一层就停不下来。也就是说，取消是一种 **请求**，不是命令。写得好的工具会把 `signal` 传给 `fetch`、子进程、文件读取，收到信号就停；写得不好的工具会忽略它，继续跑下去。JavaScript 没有办法"杀死"一个 Promise，我们唯一能做的就是 **不再等它**。

这带来两个推论：

- **超时的工具让出它的名额**。如果并发上限是 4，一个超时的工具还占着名额，那么四个不听话的工具就能让后面所有调用永远排不上队
- **同一个调用可能有两个结果**：先超时，几秒后工具又返回了。以第一个为准，后来的结果直接丢掉。实现里用一个"这个位置已经有结果了吗"的检查保证这一点

## 取消：所有没完成的立刻结束

```ts
signal.addEventListener(
  "abort",
  () => {
    calls.forEach((_, index) =>
      finish(index, { ok: false, status: "cancelled", content: CANCELLED_CONTENT }),
    );
  },
  { once: true },
);
```

外面的 `signal` 被取消时：

- 正在执行的调用：通过 `AbortSignal.any` 收到取消信号，同时 **立刻** 得到 cancelled 结果
- 还没开始的调用：**不再开始**，直接得到 cancelled 结果
- `signal` 一开始就是取消的：一个都不执行

为什么取消了还要给每个调用一个结果？因为聊天记录里那条 assistant 消息已经带着这些工具调用了，接口要求每个调用都有回应（[6.1 节](01-agent-loop.md)）。用户取消之后可能会接着说"那换个方法试试"，这时的记录必须是合法的。结果的内容就如实写"已取消"，模型看到它就知道那个工具没有执行完。

## 同步抛出的错误

```ts
Promise.try(() => execute(call, callSignal)).then(onSuccess, onFailure);
```

`execute` 的类型说它返回 Promise，但写工具的人可能在函数开头直接 `throw`（比如参数检查），这时根本没有 Promise，`.then` 都来不及调用，错误就从 `runToolCalls` 里冒出去了。`Promise.try`（ES2025）把"调用一个函数"包装成 Promise：同步抛出、返回值、返回 Promise，统统变成一个 Promise。凡是调用别人写的回调，都值得这样包一层。

工具抛出的错误还要再分一次类：如果这时整体已经取消了，错误多半就是取消造成的（工具收到信号后抛出了 `AbortError`），状态应该是 cancelled 而不是 error。

## 清理

无论怎样结束，都不能留下定时器：一个调用完成时清除它自己的定时器，取消时移除 `abort` 监听器。练习的测试用 `vi.getTimerCount()` 检查这一点。留下的定时器会让进程在"做完了"之后还多等几十秒才退出，在服务器上则是一点点累积起来的内存泄漏。

## 小结

- 模型请求的多个调用互不依赖，harness 应该并行执行它们，并限制并发数
- 结果按调用的顺序追加；`onResult` 按完成的顺序通知界面
- 超时和取消都 **立刻** 给出结果，不等工具自己停下；超时的工具让出名额；以第一个结果为准
- 取消后每个调用依然要有一个结果，聊天记录才是合法的
- 调用别人写的函数用 `Promise.try` 包一层；结束时清除所有定时器和监听器

## 练习

[exercises/06-harness/03-parallel-tools.ts](../../exercises/06-harness/03-parallel-tools.ts)：实现 `runToolCalls`。运行 `pnpm ex 03-parallel-tools`。

下一节：[6.4 上下文管理：token 预算与截断](04-context-window.md)
