# 3.5 并发：Promise.all 和它的兄弟们

> 这一节要解决的问题：模型一次请求了五个工具调用，要同时执行；向三个模型供应商同时发请求，用最快的那个；要处理一千个文件，但 API 限制每次最多并发五个请求。怎么组合多个 Promise？

示例代码：[examples/05-concurrency.ts](examples/05-concurrency.ts)

3.3 节已经见过 `Promise.all`。标准库一共提供了四个组合多个 Promise 的方法，它们的区别只在于"什么时候算完成"和"失败了怎么办"。

## 一览

| 方法                 | 什么时候兑现         | 什么时候拒绝              | 兑现的值                         |
| -------------------- | -------------------- | ------------------------- | -------------------------------- |
| `Promise.all`        | 全部兑现             | **任何一个** 拒绝（立刻） | 所有值组成的数组，顺序与输入相同 |
| `Promise.allSettled` | 全部完成（无论成败） | 从不拒绝                  | 每个 Promise 的结果描述          |
| `Promise.race`       | 第一个完成的是兑现   | 第一个完成的是拒绝        | 第一个完成的值                   |
| `Promise.any`        | 第一个兑现的         | **全部** 拒绝             | 第一个兑现的值                   |

它们都接收一个 Promise 的数组（准确地说是任何可迭代对象，里面也可以混着普通值），返回一个新的 Promise。注意它们只是 **等待**，并不负责 **启动**：传进去的 Promise 在创建时就已经开始执行了。

## `Promise.all`：全部成功

```ts
const [profile, models] = await Promise.all([fetchProfile(), fetchModels()]);
// profile: { name: string }，models: string[]
```

传入一个数组字面量时，TypeScript 会把它当成元组，**每个位置的类型都被保留**。配合解构，就能一次拿到多个不同类型的结果。

`Promise.all` 是 **快速失败** 的：任何一个拒绝，整体立刻拒绝，原因就是第一个拒绝的原因。要特别注意：

- **其他的 Promise 不会被取消。** JavaScript 的 Promise 本身没有"取消"的概念，它们会在后台继续运行直到结束，只是结果没人要了。如果它们是昂贵的请求，需要配合 3.6 节的 `AbortSignal` 真正地停下它们
- **其他 Promise 的成功结果拿不到了。** 五个工具调用里一个失败，另外四个的结果也随之丢失

所以 `Promise.all` 适合"缺一不可"的场景：几个结果都要用到，任何一个失败，整件事就没有意义了。

## `Promise.allSettled`：每个结果都要

```ts
const settled = await Promise.allSettled([fetchModels(), failAfter(10, "工具 B 超时")]);
for (const result of settled) {
  if (result.status === "fulfilled") {
    console.log("成功：", result.value);
  } else {
    console.log("失败：", result.reason);
  }
}
```

`allSettled` 等所有 Promise 都完成，**永远不会拒绝**。每个结果的类型是 `PromiseSettledResult<T>`，一个以 `status` 为辨识字段的可辨识联合：

```ts
type PromiseSettledResult<T> =
  { status: "fulfilled"; value: T } | { status: "rejected"; reason: any };
```

（标准库的实际定义是两个接口的联合，效果相同。）又一次看到 `reason: any`，又一次，自己把它当 `unknown` 处理。

执行工具调用就是 `allSettled` 的典型场景：每个工具的结果，无论成败，都要报告给模型。3.3 节练习里的 `runConcurrently` 自己实现了同样的效果。

### 过滤出成功的结果

```ts
const values = settled
  .filter((result) => result.status === "fulfilled")
  .map((result) => result.value);
// values: string[]
```

从 TypeScript 5.5 开始，像 `(result) => result.status === "fulfilled"` 这样的回调会被自动 **推断为类型守卫**，`filter` 之后的数组类型就是 `PromiseFulfilledResult<string>[]`，可以直接读 `value`。在更早的版本里，需要手写 `(result): result is PromiseFulfilledResult<string> => ...`，你在别人的代码里还会经常见到这种写法。

## `Promise.race`：第一个完成的

```ts
const winner = await Promise.race([sleep(50).then(() => "慢的"), sleep(10).then(() => "快的")]);
// "快的"
```

`race` 采用第一个 **完成** 的 Promise 的结果，无论成败。它最经典的用法是 **超时**：让任务和一个定时器赛跑。

```ts
function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("超时")), ms));
}

const reply = await Promise.race([callModel(prompt), timeout(30_000)]);
```

这能让调用方不再等待，但和 `Promise.all` 一样，**输掉比赛的那个不会停下**：超时之后，模型请求仍在后台继续，连接一直占着。而且即使任务很快完成，定时器也还在，会让进程多等 30 秒才能退出。真正的超时需要能 **取消** 任务，这正是下一节的内容。

## `Promise.any`：第一个成功的

```ts
const firstOk = await Promise.any([failAfter(5, "镜像 1 挂了"), sleep(20).then(() => "镜像 2")]);
// "镜像 2"
```

`any` 忽略失败，采用第一个 **成功** 的结果。只有全部失败时才拒绝，原因是一个 `AggregateError`，它的 `errors` 属性按输入的顺序列出了每个失败的原因。

适合"多个来源，哪个能用就用哪个"：同时向几个镜像发请求。不过对模型 API 来说，同时请求几个供应商意味着付几份钱，通常按顺序回退（3.3 节练习里的 `firstSuccessful`）更合适。

## 限制并发数

`Promise.all(items.map(fn))` 会 **一次性** 启动所有任务。任务少的时候没问题；一千个任务就会同时发出一千个请求，结果往往是：

- 触发 API 的速率限制，收到一堆 429
- 打开的连接或文件太多，超出操作系统的限制
- 内存里同时存着一千个正在进行的响应

需要的是"同时最多 N 个"。一个简洁的实现是 **工作者池**：启动 N 个工作者，每个工作者循环地从共享的队列里领取下一个任务，直到任务领完：

```ts
async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++; // 同步地"领取"一个下标
      results[index] = await fn(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
```

几个值得注意的地方：

- **为什么 `next++` 是安全的？** 多个工作者"同时"运行，却不会领到同一个下标。因为 JS 是单线程的（3.1 节）：`const index = next++` 是一段同步代码，执行过程中不会被打断。只有在 `await` 处，其他工作者才有机会运行。这在多线程语言里需要加锁，在 JS 里是免费的
- **结果按输入顺序排列**：每个结果写到自己的下标，而不是 `push`，所以完成的先后不影响顺序
- **`items[index] as T`**：开启 `noUncheckedIndexedAccess` 后，`items[index]` 的类型是 `T | undefined`。这里循环条件保证了下标有效，所以断言是安全的
- **失败了会怎样？** 某个 `fn` 拒绝时，它所在的工作者结束，`Promise.all` 立刻拒绝。但 **其他工作者还会继续领取新任务**，这通常不是我们想要的。本节练习会修复这一点

实际项目中可以用现成的库（如 `p-limit`），但这个模式值得亲手写一遍：它展示了单线程并发最核心的思路。

## 小结

- `all`：缺一不可，快速失败；`allSettled`：每个结果都要，永不拒绝；`race`：第一个完成的；`any`：第一个成功的
- 这些方法只负责等待，不负责启动，也不会取消输掉的或剩下的 Promise
- 传入数组字面量时，`Promise.all` 保留每个位置的类型；`allSettled` 的结果是可辨识联合，`filter` 的回调能自动推断为类型守卫
- 大量任务要限制并发数：N 个工作者从共享队列领取任务；单线程保证了领取的过程不会冲突

## 练习

[exercises/03-async/05-batch.ts](../../exercises/03-async/05-batch.ts)：实现有并发上限的 `mapWithConcurrency`（失败后不再启动新任务）、一个可复用的并发限制器，以及把 `Promise.all` 扩展到对象上的 `allObject`（含类型测试）。运行 `pnpm ex 05-batch`。

下一节：[3.6 取消与超时：AbortController](06-cancellation.md)
