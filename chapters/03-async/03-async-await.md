# 3.3 async/await

> 这一节要解决的问题：Promise 链比回调好多了，但一长串 `.then` 仍然不如普通代码好读：变量要在回调之间传来传去，`if`、`for`、`try/catch` 都没法直接用。能不能用写同步代码的方式写异步代码？

示例代码：[examples/03-async-await.ts](examples/03-async-await.ts)

## 基本用法

```ts
async function callModel(prompt: string): Promise<string> {
  await sleep(30);
  return `回答：${prompt}`;
}

const reply = await callModel("你好"); // string
```

两个关键字：

- **`async`** 写在函数前面，表示这是一个异步函数。它 **总是返回 Promise**：`return "x"` 得到的是兑现值为 `"x"` 的 Promise，函数里抛出异常得到的是被拒绝的 Promise
- **`await`** 写在一个 Promise 前面，暂停当前函数，等这个 Promise 完成：兑现了，`await` 表达式的值就是兑现值；拒绝了，就在这里 **抛出** 拒绝的原因

`await` 只暂停 **当前这个 async 函数**，不会阻塞线程。函数暂停期间，事件循环照常处理其他任务（3.1 节）；Promise 完成后，函数的剩余部分作为微任务继续执行。所以 `async`/`await` 只是 Promise 的另一种写法，底层完全一样。

和 Python 的 `async def` / `await` 几乎相同。一个区别是：Python 调用 `async def` 函数得到的协程在被 `await` 之前不会执行，而 JavaScript 的 async 函数 **一调用就开始执行**，直到遇到第一个 `await`（练习 3-1 的谜题 4）。

## 返回类型写 `Promise<T>`

```ts
async function getModelName(): string {
  // ❌ The return type of an async function or method must be the global Promise<T> type.
  //    Did you mean to write 'Promise<string>'?
  return "gpt-5";
}
```

async 函数的返回类型必须写成 `Promise<T>`，函数体里 `return` 的却是 `T`。TypeScript 会检查 `return` 的值能否赋值给 `T`。

反过来，拿到一个 Promise 类型，想知道 `await` 之后是什么类型，用 2.5 节介绍过的 `Awaited`：

```ts
type Reply = Awaited<ReturnType<typeof callModel>>; // string
```

## 错误处理：又可以用 try/catch 了

```ts
try {
  const reply = await callModel("你好");
  console.log(reply);
  await callModel("出错吧");
} catch (error) {
  console.log("捕获：", error instanceof Error ? error.message : error);
} finally {
  console.log("finally 照常执行");
}
```

被拒绝的 Promise 在 `await` 处变成异常，于是普通的 `try/catch/finally` 全都能用。`catch (error)` 里的 `error` 是 `unknown`（1.7 节），这一点比 `.catch` 回调的 `any` 更安全。

### `return` 还是 `return await`

在 `try` 块里返回一个 Promise 时，有没有 `await` 是有区别的：

```ts
async function withoutAwait(): Promise<string> {
  try {
    return callModel("出错了"); // 错误会逃出这个函数
  } catch {
    return "在函数内部处理了";
  }
}

async function withAwait(): Promise<string> {
  try {
    return await callModel("出错了"); // 错误在这里被接住
  } catch {
    return "在函数内部处理了";
  }
}
```

`return promise` 直接把 Promise 交了出去，函数在它完成之前就离开了 `try` 块，之后的拒绝自然接不住。`return await promise` 先在 `try` 里等它完成，拒绝就变成了 `try` 里的异常。**在 `try` 里面，返回 Promise 时要写 `await`**；在 `try` 外面，两种写法效果相同。

## 顺序还是并发

`await` 让异步代码读起来像同步代码，也让人很容易不小心写出 **不必要的顺序执行**：

```ts
const sequential: string[] = [];
for (const prompt of prompts) {
  sequential.push(await callModel(prompt)); // 一个接一个：3 × 30ms
}
```

每次循环都要等上一个调用完成才发起下一个。如果几次调用互不依赖，应该同时发起，再一起等待：

```ts
const parallel = await Promise.all(prompts.map((prompt) => callModel(prompt))); // 约 30ms
```

`prompts.map(...)` 立刻调用了三次 `callModel`，得到三个正在进行的 Promise；`Promise.all` 等它们全部完成，按原来的顺序返回结果。3.5 节会详细讲 `Promise.all` 和它的兄弟们。

什么时候应该顺序执行？

- 后一步依赖前一步的结果（先让模型规划，再执行计划）
- 有副作用的操作必须按顺序发生（按顺序写入聊天记录）
- 需要限制同时进行的数量（API 有速率限制），这时用 3.5 节的并发限制，而不是完全顺序

### 先启动，后等待？小心未处理的拒绝

既然 async 函数一调用就开始执行，下面的写法似乎也能并发：

```ts
const a = callModel("一"); // 已经开始
const b = callModel("二"); // 也开始了
console.log(await a, await b);
```

它确实是并发的，但有一个隐患：如果 `b` 在 `a` 完成之前就失败了，那一刻还没有人在等 `b`（`await b` 还没执行到）。Node.js 会认为这是一个 **未处理的拒绝**（unhandled rejection），默认直接 **让进程崩溃**，即使外面套了 `try/catch` 也一样，因为 `try/catch` 只能接住 `await` 处抛出的异常。

`Promise.all([a, b])` 会立刻给每个 Promise 挂上处理函数，没有这个问题。**需要并发时用 `Promise.all`**（或 3.5 节的其他组合方法），而不是先启动、后逐个等待。

## 忘了写 await

忘写 `await` 是异步代码里最常见的 bug。结果拿到的是一个 Promise 对象，而不是值。TypeScript 能发现大部分情况，因为 `Promise<string>` 和 `string` 类型不同：

```ts
const reply = callModel("你好");
reply.toUpperCase(); // ❌ Property 'toUpperCase' does not exist on type 'Promise<string>'.

async function isAllowed(): Promise<boolean> {
  /* ... */
}
if (isAllowed()) {
  // ❌ This condition will always return true since this 'Promise<boolean>' is always defined.
}
```

但有一种情况 TypeScript 不会报错：**调用了 async 函数却完全不使用返回值**。

```ts
async function saveTranscript(): Promise<void> {
  /* ... */
}

saveTranscript(); // 不报错：没等它完成，它失败了也没人知道
```

这种"漂浮的 Promise"（floating promise）要靠 lint 工具发现（typescript-eslint 的 `no-floating-promises` 规则，第 4 章会配置）。如果确实是有意不等待（比如发一条不重要的统计日志），在前面加上 `void`，表明这是故意的：`void sendTelemetry()`。但要记住，这样它的失败就成了未处理的拒绝，所以有意不等待的 Promise 自己要处理好错误。

### forEach 不会等待

```ts
prompts.forEach(async (prompt) => {
  done.push(await callModel(prompt));
});
console.log(done.length); // 0：forEach 早就返回了
```

`forEach` 调用回调后不管它返回什么，async 回调返回的 Promise 被直接丢掉了。需要顺序执行时用 `for...of`，需要并发时用 `map` + `Promise.all`。`map`、`filter` 等数组方法同理：`filter(async ...)` 永远不会按你想的工作，因为 Promise 对象总是真值。

## 顶层 await

在 ES 模块里（本仓库的 `package.json` 设置了 `"type": "module"`），模块的顶层可以直接写 `await`，不需要包在 async 函数里。示例文件和练习里都是这么写的。一个模块的顶层 `await` 会推迟所有导入它的模块的执行，所以库代码里尽量不要用，在程序的入口文件里用很方便。

## 小结

- `async` 函数总是返回 Promise，返回类型写 `Promise<T>`；`await` 暂停当前函数直到 Promise 完成，不阻塞线程
- 拒绝在 `await` 处变成异常，用 `try/catch/finally` 处理；在 `try` 里返回 Promise 要写 `return await`
- 互不依赖的操作用 `Promise.all` 并发，不要在循环里逐个 `await`；也不要"先启动、后逐个等待"
- 忘写 `await` 时类型不匹配，TypeScript 通常会报错；完全不用返回值的"漂浮的 Promise"要靠 lint 发现
- `forEach`、`filter` 不理解 async 回调：用 `for...of` 或 `map` + `Promise.all`

## 练习

先回去做完练习 3-1 的谜题 4、5。然后：

[exercises/03-async/03-tool-runner.ts](../../exercises/03-async/03-tool-runner.ts)：用 async/await 实现工具调用的顺序执行、并发执行和按顺序回退。运行 `pnpm ex 03-tool-runner`。

下一节：3.4 错误处理（编写中）
