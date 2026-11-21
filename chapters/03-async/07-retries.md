# 3.7 重试与退避

> 这一节要解决的问题：调用模型 API 时，偶尔会遇到 429（请求太频繁）、503（服务暂时不可用）或者网络抖动。这些失败过一会儿往往就好了。什么样的失败值得重试？等多久再试？试几次？怎么避免重试本身把事情搞得更糟？

示例代码：[examples/07-retries.ts](examples/07-retries.ts)

[1.4 节的练习](../../exercises/01-basics/03-backoff.ts) 计算过"第 n 次重试前该等多久"。现在我们有了 Promise、错误类型和取消，可以真正地等待和重试了。

## 什么值得重试

重试只对 **暂时性** 的失败有意义，也就是"同样的请求，过一会儿再发，可能就成功了"：

| 值得重试                             | 不值得重试                                   |
| ------------------------------------ | -------------------------------------------- |
| 429 请求太频繁（限流）               | 400 请求格式错误：重发一百次也是错的         |
| 500、502、503、504 等服务器错误      | 401、403 认证或权限问题：密钥不会自己变对    |
| 408 请求超时，409 冲突               | 404 模型名写错了                             |
| 网络故障（`fetch` 抛出 `TypeError`） | 用户取消（`AbortError`）：用户就是不想要了   |
| 我们自己设的超时（视情况）           | 代码 bug（`TypeError: x is not a function`） |

3.4 节练习里的 `isRetryable` 就是这张表的代码版本。最后一行值得注意：`fetch` 的网络故障和代码 bug 都可能是 `TypeError`。所以重试的判断应该只包住 `fetch` 本身，而不是一大段代码，否则一个 bug 会被当成网络问题反复重试。

### 重试的代价

还要问一个问题：**这个操作重复执行，会有副作用吗？**

- 向模型 API 发同一个请求两次，最多多花一次钱，结果没有本质区别，可以重试
- 一个"发送邮件"的工具，第一次请求可能其实已经成功了，只是响应在路上丢了。重试就会发出两封邮件

能安全地重复执行的操作叫 **幂等**（idempotent）的。非幂等的操作不要自动重试，或者要配合"幂等键"之类的机制（一些支付 API 支持）。这也是为什么 agent 执行工具失败时，通常是把错误交给模型决定下一步，而不是由 harness 自动重试工具。

## 等多久：指数退避

失败后立刻重试，服务器多半还没缓过来。等待时间应该随着失败次数 **指数增长**：

```ts
function backoffDelay(attempt: number, baseMs = 100, maxMs = 2000): number {
  return Math.min(baseMs * 2 ** (attempt - 1), maxMs);
}
// 100 → 200 → 400 → 800 → 1600 → 2000 → 2000 ……
```

增长的倍数通常是 2，并且要有上限：让用户等十分钟再重试没有意义。

## 抖动：别让所有人同时重试

设想服务器短暂故障，一千个客户端同时收到 503。如果它们都严格按 100ms、200ms、400ms 重试，那么一千个请求会在完全相同的时刻再次涌向刚恢复的服务器，再次把它压垮。这叫 **惊群效应**（thundering herd）。

解决办法是给等待时间加上随机性，叫 **抖动**（jitter）。最简单也很有效的是"全抖动"（full jitter）：在 0 到退避时间之间随机取一个值。

```ts
function fullJitter(ms: number, random: () => number = Math.random): number {
  return Math.round(ms * random());
}
```

`random` 作为参数传入，默认是 `Math.random`。和 3.3 节练习里的时钟一样，这是为了测试：测试时传入一个固定的函数，结果就是确定的。

## 听服务器的：Retry-After

限流时，服务器往往会在响应头里告诉你该等多久：

```
HTTP/1.1 429 Too Many Requests
Retry-After: 2
```

`Retry-After` 的值有两种格式：一个整数（秒数），或者一个 HTTP 日期（`Thu, 01 Jan 2026 00:00:05 GMT`）。服务器明确给出了等待时间时，应该 **优先采用它**，而不是自己算的退避时间，因为服务器最清楚自己什么时候恢复。本节练习会实现 `parseRetryAfter`。

## 写一个通用的 retry

```ts
async function retry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt > options.retries || !options.shouldRetry(error)) {
        throw error; // 次数用完，或者不值得重试：把最后一次的错误原样抛出
      }
      const delayMs =
        error instanceof ApiError && error.retryAfterMs !== undefined
          ? error.retryAfterMs
          : fullJitter(backoffDelay(attempt, 10));
      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
}
```

几个设计决定：

- **`retries` 是重试的次数，不含第一次尝试。** `retries: 3` 最多调用 4 次。名字要起清楚，"最多尝试 3 次"和"最多重试 3 次"差了一次
- **失败时抛出最后一次的错误，原样抛出。** 调用方看到的错误和不重试时一样，可以用同样的方式处理（比如 `instanceof ApiError`）。如果想保留每一次的错误，可以抛出 `AggregateError`，但大多数时候最后一次的错误就够了
- **`return await`**：`try` 里返回 Promise，必须写 `await`（3.3 节），否则 `fn` 的失败根本不会进入 `catch`
- **`onRetry` 钩子**：让调用方可以记录日志或在界面上提示"正在重试……"。静默地重试会让用户以为程序卡住了
- **`fn` 收到当前是第几次尝试**：方便在日志里标注，或者在最后一次尝试时换一个备用模型

本节练习的 `retry` 在此基础上还要支持取消：重试之间的等待要用 3.6 节的 `abortableSleep`，用户取消时立刻停下，而不是等完这一轮退避。

## 流式响应不要中途重试

调用模型时常常使用流式输出（3.9 节）：服务器边生成边发送，用户能看到文字一个个出现。如果流到一半连接断了，能直接重试吗？

不能简单地重试：用户已经看到了一半的回答，重试会得到一个全新的、内容不同的回答。所以章末项目采用的策略是：**只在收到响应之前重试**（连接失败、返回 429/5xx）；一旦开始接收流式数据，出错就直接报告给调用方，由上层决定怎么办。

## 小结

- 只重试暂时性的失败：429、5xx、网络故障；400、401、404 和用户取消不重试
- 非幂等的操作（发邮件、扣款）不要自动重试
- 等待时间指数增长，有上限，再加上抖动，避免所有客户端同时重试
- 服务器给了 `Retry-After`，就听服务器的
- 重试要能被取消；流式响应开始之后不要自动重试

## 练习

[exercises/03-async/07-retry.ts](../../exercises/03-async/07-retry.ts)：实现 `parseRetryAfter` 和一个支持退避、抖动、Retry-After、取消的 `retry`。运行 `pnpm ex 07-retry`。

下一节：[3.8 异步迭代器与生成器](08-async-iterators.md)
