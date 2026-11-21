# 3.6 取消与超时：AbortController

> 这一节要解决的问题：模型正在长篇大论地流式输出，用户按下 Ctrl+C，想让它停下；一个工具调用卡住了，30 秒后应该放弃。上一节看到，`Promise.race` 只能让我们不再等待，被放弃的操作却还在后台运行。怎么真正地 **停下** 一个异步操作？

示例代码：[examples/06-cancellation.ts](examples/06-cancellation.ts)

## Promise 没有"取消"

Promise 只是一个结果的容器，它不知道产生这个结果的操作是什么，自然也没法停下它。所以取消需要一个额外的通道：**调用方通过它发出"停下"的信号，执行方监听这个信号并主动停下。** JavaScript（浏览器和 Node.js 都一样）的标准方案是 `AbortController` 和 `AbortSignal`。

## AbortController 和 AbortSignal

```ts
const controller = new AbortController();
const { signal } = controller;

signal.addEventListener("abort", () => console.log("收到取消通知，原因：", signal.reason), {
  once: true,
});
controller.abort("用户按了 Ctrl+C");

signal.aborted; // true
signal.reason; // "用户按了 Ctrl+C"
```

职责分得很清楚：

- **`AbortController`** 在调用方手里，它只有一个方法 `abort(reason?)`
- **`AbortSignal`**（`controller.signal`）交给执行方，它只能 **观察**：`aborted` 表示是否已取消，`reason` 是取消的原因，`"abort"` 事件在取消时触发

把 signal 交出去，执行方没法反过来取消调用方的其他操作。一个 signal 只会被取消一次，之后再调用 `abort` 没有效果。

`abort()` 不传原因时，`reason` 是一个 `name` 为 `"AbortError"` 的 `DOMException`（它也是 `Error` 的子类）。

## 让函数支持取消

约定是：可以被取消的函数接收一个 **可选的** `signal`，通常放在选项对象里。`fetch` 就是这样：

```ts
const response = await fetch(url, { signal });
```

signal 被取消时，`fetch` 会中断请求（关闭连接），返回的 Promise 以 `signal.reason` 拒绝。Node.js 的很多 API 也接受 `signal`：`node:timers/promises` 的 `setTimeout`、`node:fs/promises` 的 `readFile`、`node:child_process` 的 `spawn`……

自己写的异步函数要支持取消，需要做三件事。以一个可取消的 `sleep` 为例：

```ts
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason); // 1. 开始前检查：已经取消了就不要启动
      return;
    }
    const onAbort = () => {
      clearTimeout(timer); // 2. 取消时：停下正在进行的工作，以 reason 拒绝
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort); // 3. 正常完成时：移除监听
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
```

1. **开始前检查。** 一个已经被取消的 signal 不会再触发 `abort` 事件，所以只监听是不够的。在 async 函数里，可以直接调用 `signal?.throwIfAborted()`，已取消时它会抛出 `signal.reason`
2. **取消时停下，并以 `signal.reason` 拒绝。** 用 `reason` 而不是新建一个错误，调用方才能知道是 **为什么** 被取消的（用户取消、超时，还是别的）
3. **完成后清理监听。** 同一个 signal 常常会被传给很多个操作（整个 agent 会话共用一个）。`{ once: true }` 只在事件触发后才移除监听，如果操作正常完成，监听函数就一直挂在 signal 上，连同它闭包里引用的一切（定时器、响应对象……）都无法被回收。一个运行几小时、执行上千次工具调用的 agent，就这样慢慢泄漏内存

### 一路传下去

取消是 **协作式** 的：只有每一层都把 signal 传给下一层，取消才能到达真正在干活的地方。

```ts
async function runAgent(task: string, options: { signal?: AbortSignal } = {}): Promise<string> {
  const plan = await callModel(planPrompt(task), options); // 传下去
  const results = await runTools(plan, options); // 传下去
  return callModel(summaryPrompt(results), options); // 传下去
}
```

漏传一处，那一层就停不下来。在 async 函数里，也可以在关键的步骤之间调用 `options.signal?.throwIfAborted()`，避免在已经取消之后还发起新的请求。

### exactOptionalPropertyTypes 和 signal

```ts
async function callSlowApi(options: { signal?: AbortSignal } = {}): Promise<string> {
  const response = await fetch(url, { signal: options.signal });
  // ❌ Argument of type '{ signal: AbortSignal | undefined; }' is not assignable to parameter of type 'RequestInit'
  //    with 'exactOptionalPropertyTypes: true'. ...
}
```

`options.signal` 的类型是 `AbortSignal | undefined`，而开启 `exactOptionalPropertyTypes` 后，可选属性不接受显式的 `undefined`（1.8 节）。`RequestInit` 的 `signal` 允许 `null`，所以写 `{ signal: options.signal ?? null }` 就行。对于不接受 `null` 的属性，可以用展开：`{ ...(signal && { signal }) }`，没有 signal 时就不写这个属性。

## 超时

超时就是"到点自动取消"。`AbortSignal.timeout(ms)` 返回一个在 `ms` 毫秒后自动取消的 signal，它的 `reason` 是一个 `name` 为 `"TimeoutError"` 的 `DOMException`：

```ts
const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
```

和上一节用 `Promise.race` 实现的超时相比：

- 超时后请求 **真的被中断** 了，连接被关闭
- `AbortSignal.timeout` 内部的定时器不会阻止 Node.js 进程退出，任务早早完成时，不会有一个定时器拖住进程

### 组合多个信号

实际情况往往是"用户可能取消，同时还有超时"。`AbortSignal.any` 把多个 signal 合并成一个，任何一个被取消，它就被取消，`reason` 是最先取消的那个的 `reason`：

```ts
async function callModel(
  prompt: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
) {
  const signals = [AbortSignal.timeout(options.timeoutMs ?? 60_000)];
  if (options.signal) {
    signals.push(options.signal);
  }
  const response = await fetch(url, {
    method: "POST",
    body: prompt,
    signal: AbortSignal.any(signals),
  });
  return response.text(); // 读取响应体时，同一个 signal 仍然有效
}
```

注意这里的超时覆盖的是 **整个请求**：从发出请求，到读完响应体。对一次普通的请求，这正是我们想要的。但对于要读很久的流式响应，"总时长"往往不是合适的限制，3.10 节的项目会把超时拆成"等待响应头"和"两块数据之间的间隔"两段。

## 区分取消、超时和失败

一个操作以拒绝告终，可能有三种完全不同的原因，处理方式也不同：

| 原因       | 怎么识别                                           | 通常怎么处理                       |
| ---------- | -------------------------------------------------- | ---------------------------------- |
| 用户取消   | `error.name === "AbortError"`（或你传入的 reason） | 安静地停下，不算错误，不重试       |
| 超时       | `error.name === "TimeoutError"`                    | 可能值得重试，或者告诉用户"太慢了" |
| 真正的失败 | 其他错误                                           | 按 3.4 节的方式处理                |

检查 `name` 而不是 `instanceof DOMException`，因为取消的原因可以是任何值，不同的库可能会把它包装成自己的错误类型（比如 `node:timers/promises` 会抛出 Node.js 自己的 `AbortError`，原始的 `reason` 放在 `cause` 里）。

## 在命令行程序里响应 Ctrl+C

```ts
const controller = new AbortController();
process.once("SIGINT", () => controller.abort(new DOMException("用户按了 Ctrl+C", "AbortError")));

try {
  await runAgent(task, { signal: controller.signal });
} catch (error) {
  if (error instanceof Error && error.name === "AbortError") {
    console.log("\n已停止。");
  } else {
    throw error;
  }
}
```

监听了 `SIGINT` 以后，Ctrl+C 不再直接杀死进程，而是交给你的代码处理：停下正在进行的请求，保存聊天记录，然后正常退出。这是一个好用的 CLI agent 必备的细节，章末项目的演示程序就是这么做的。

## 小结

- Promise 本身不能取消；`AbortController` 发出取消信号，`AbortSignal` 传给执行方观察
- 可取消的函数：接收可选的 `signal`，开始前检查，取消时停下并以 `signal.reason` 拒绝，完成后移除监听
- 取消是协作式的：每一层都要把 signal 传下去
- `AbortSignal.timeout(ms)` 实现真正的超时，`AbortSignal.any([...])` 组合多个信号
- 用 `error.name` 区分用户取消（`AbortError`）、超时（`TimeoutError`）和真正的失败

## 练习

[exercises/03-async/06-abort.ts](../../exercises/03-async/06-abort.ts)：实现可取消的 `abortableSleep`、带超时的 `withTimeout`、让任意 Promise 可以提前放弃的 `raceAbort`，以及识别取消和超时的函数。运行 `pnpm ex 06-abort`。

下一节：[3.7 重试与退避](07-retries.md)
