# 3.2 Promise

> 这一节要解决的问题：调用模型 API，结果要几秒后才有。怎么表示"一个将来才会有的值"，并且能像普通的值一样传递、变换、组合，出错时还能统一处理？

示例代码：[examples/02-promises.ts](examples/02-promises.ts)

## 从回调说起

最早的异步 API 都是 **回调** 风格：把"拿到结果以后要做的事"作为函数传进去。Node.js 的惯例是回调的第一个参数是错误：

```ts
legacyLoadPrompt("system", (error, text) => {
  if (error) {
    console.error(error);
    return;
  }
  legacyCallModel(text, (error, reply) => {
    if (error) {
      console.error(error);
      return;
    }
    // 再嵌套一层……
  });
});
```

问题很明显：每多一步就多嵌套一层；每一层都要自己检查错误，漏掉一个就悄无声息地吞掉了错误；想"同时发起三个请求，都完成后再继续"更是要自己写计数器。

**Promise** 把"将来的值"变成了一个对象。拿到这个对象，就可以随时在上面挂"完成后要做的事"，可以把它传给别的函数，也可以把多个 Promise 组合起来。

## Promise 的三种状态

一个 Promise 在任何时刻都处于三种状态之一：

| 状态                | 含义                    |
| ------------------- | ----------------------- |
| pending（进行中）   | 还没有结果              |
| fulfilled（已兑现） | 成功了，有一个 **值**   |
| rejected（已拒绝）  | 失败了，有一个 **原因** |

后两种统称 settled（已敲定）。状态只能从 pending 变成 fulfilled 或 rejected，**变了以后就不会再变**：一个 Promise 只会完成一次。

## `Promise<T>`：类型里只有成功的值

TypeScript 用 `Promise<T>` 描述一个 Promise，`T` 是成功时的值的类型：

```ts
function loadPrompt(name: string): Promise<string> {
  /* ... */
}
```

注意 **类型里没有失败的原因**。一个 `Promise<string>` 可能因为任何东西被拒绝：一个 `Error`、一个字符串，甚至 `undefined`。这和同步函数一样：TypeScript 不追踪一个函数可能抛出什么。所以处理失败时，原因的类型永远应该当作 `unknown`。3.4 节会专门讨论这个问题，并介绍把错误放进类型里的做法。

## 创建 Promise

### `new Promise`

最底层的方式是 `new Promise`，传入一个函数（叫 executor），它会收到 `resolve` 和 `reject` 两个函数：

```ts
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
```

- 调用 `resolve(值)`，Promise 变成 fulfilled；调用 `reject(原因)`，变成 rejected
- executor 是 **立即同步执行** 的。`new Promise` 本身不会让代码"变成异步"，它只是给你一个时机去启动异步操作，并在操作完成时调用 `resolve`
- 只有第一次调用 `resolve` 或 `reject` 有效，之后的调用都被忽略
- executor 里同步抛出的异常，会让 Promise 变成 rejected

`new Promise` 的类型参数通常从返回类型推断出来。单独使用时要自己写上，否则会推断成 `Promise<unknown>`，而且调用 `resolve()` 时会报错：

```ts
const timer = new Promise((resolve) => setTimeout(() => resolve(), 10));
// ❌ Expected 1 arguments, but got 0. Did you forget to include 'void' in your type argument to 'Promise'?
const fixed = new Promise<void>((resolve) => setTimeout(() => resolve(), 10)); // ✅
```

### 包装回调 API

`new Promise` 最常见的用途是把回调风格的 API 包装成 Promise，这样就只需要处理一次回调：

```ts
function loadPrompt(name: string): Promise<string> {
  return new Promise((resolve, reject) => {
    legacyLoadPrompt(name, (error, text) => {
      if (error) {
        reject(error);
      } else {
        resolve(text ?? "");
      }
    });
  });
}
```

Node.js 的大部分内置模块都已经提供了 Promise 版本（`node:fs/promises`、`node:timers/promises`），`node:util` 里还有一个通用的 `promisify`。本节练习会让你自己写一个。

### 其他方式

- `Promise.resolve(值)`：得到一个已经兑现的 Promise
- `Promise.reject(原因)`：得到一个已经拒绝的 Promise
- `Promise.withResolvers<T>()`：返回 `{ promise, resolve, reject }`，适合"在一个地方创建、在另一个地方完成"的情况，比如等待用户在终端里确认：

```ts
const { promise: userConfirmed, resolve: confirm } = Promise.withResolvers<boolean>();
setTimeout(() => confirm(true), 5); // 比如：用户在终端里按了 y
```

## 使用 Promise：`then`、`catch`、`finally`

```ts
loadPrompt("system").then((text) => {
  console.log(text);
});
```

`then` 的回调在 Promise 兑现时被调用，参数是兑现的值。关键在于：**`then` 返回一个新的 Promise**，它的值是回调的返回值。所以可以一步步地变换：

```ts
const lengthPromise: Promise<number> = loadPrompt("system")
  .then((text) => text.trim()) // Promise<string>
  .then((text) => text.length); // Promise<number>
```

每一步的类型都由 TypeScript 推断出来，鼠标悬停就能看到。

如果回调返回的本身就是一个 Promise，它会被 **展平**：`then` 返回的 Promise 会等这个内层 Promise 完成，并采用它的结果。所以在 JavaScript 里不存在"兑现值是 Promise 的 Promise"，类型里也看不到 `Promise<Promise<string>>`：

```ts
const both: Promise<string> = loadPrompt("system").then((text) =>
  sleep(5).then(() => `${text}（延迟加载）`),
);
```

这是 Promise 能串起多个异步步骤的关键：每一步都返回 Promise，链条就能一直接下去，而不是越嵌越深。

### 错误沿着链传递

```ts
loadPrompt("planner")
  .then((text) => text.length) // 跳过
  .catch((error: unknown) => {
    console.log("出错了：", error instanceof Error ? error.message : error);
    return 0; // 链"恢复"了
  })
  .then((length) => console.log("长度：", length)) // 长度： 0
  .finally(() => console.log("无论成功失败都会执行"));
```

- Promise 被拒绝时，后面的 `then` 回调都会被跳过，直到遇到 `catch`。这就像同步代码里的异常：抛出后跳过后面的语句，直到被 `try/catch` 接住
- `then` 的回调里 **抛出异常**，等同于返回一个被拒绝的 Promise。所以 `JSON.parse` 失败这类错误也会被下游的 `catch` 接住
- `catch` 返回一个值，链就恢复成功状态；在 `catch` 里再次抛出，链继续保持失败
- `finally` 不接收参数，也不改变结果，适合做清理工作（关闭连接、停止计时）

> `catch` 回调的参数在标准库里的类型是 `any`。这是历史原因，和 `try/catch` 不一样（严格模式下 `catch (error)` 里的 `error` 是 `unknown`，见 1.7 节）。养成习惯，自己写上 `(error: unknown)`。

## 常见的错误

**1. 忘了 `return`。** `then` 回调里启动了另一个异步操作却没有返回它，链条就"断"了：下一步不会等它，它的错误也没人接住。

```ts
loadPrompt("system")
  .then((text) => {
    saveToCache(text); // ❌ 少了 return：下一步不会等待保存完成
  })
  .then(() => console.log("保存完了？其实不一定"));
```

TypeScript 能帮一点忙：悬停会看到这一步的类型是 `Promise<void>`，而不是你以为的类型。

**2. 嵌套 `then`。** 在 `then` 里面再写 `.then(...)`，就又回到了回调地狱。应该返回内层的 Promise，在外层接着写 `then`。

**3. 把已有的 Promise 包进 `new Promise`。**

```ts
// ❌ 多此一举，而且容易漏掉 reject，让错误消失
function getLength(): Promise<number> {
  return new Promise((resolve) => {
    loadPrompt("system").then((text) => resolve(text.length));
  });
}

// ✅ 直接用 then 变换
function getLengthBetter(): Promise<number> {
  return loadPrompt("system").then((text) => text.length);
}
```

`new Promise` 只用来包装 **还不是 Promise** 的东西（回调、事件、定时器）。

## then 的回调总是异步执行

即使 Promise 已经兑现，`then` 的回调也不会立刻执行，而是作为微任务排队（3.1 节）。所以"先注册回调，还是先完成"对结果没有影响，回调的执行时机永远是可预测的。练习 3-1 的谜题 2、3 考的就是这一点，现在可以去做了。

## 小结

- Promise 表示一个将来的值，状态从 pending 变成 fulfilled 或 rejected，只变一次
- `Promise<T>` 只描述成功的值；失败的原因没有类型，要当作 `unknown` 处理
- `new Promise` 用来包装回调和事件，executor 立即同步执行；`withResolvers` 把 `resolve` 拿到外面
- `then` 返回新的 Promise，回调返回的 Promise 会被展平，所以可以把异步步骤串成一条链
- 错误沿着链传递到最近的 `catch`；`then` 里抛出的异常也是；`finally` 用来清理

## 练习

[exercises/03-async/02-promises.ts](../../exercises/03-async/02-promises.ts)：实现 `sleep`、把回调 API 包装成 Promise 的 `fromCallback`，以及一个自己的 `createDeferred`。运行 `pnpm ex 02-promises`。

下一节：[3.3 async/await](03-async-await.md)
