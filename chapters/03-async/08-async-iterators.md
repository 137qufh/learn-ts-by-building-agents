# 3.8 异步迭代器与生成器

> 这一节要解决的问题：调用模型时开启流式输出，回复不是一次性到达，而是一小块一小块地陆续到来，可能持续几十秒。Promise 只能表示"一个"将来的值，怎么表示"一连串"陆续到达的值？怎么一边接收一边处理，还能随时喊停？

示例代码：[examples/08-async-iterators.ts](examples/08-async-iterators.ts)

## 先回顾：迭代

`for...of` 能遍历数组、字符串、`Map`、`Set`。它们的共同点是实现了 **迭代协议**：有一个 `[Symbol.iterator]()` 方法，返回一个 **迭代器**；迭代器有一个 `next()` 方法，每次调用返回 `{ value, done }`，`done` 为 `true` 时遍历结束。

TypeScript 用 `Iterable<T>` 描述"可以被 `for...of` 遍历、每次得到一个 `T`"的东西。写函数参数时，接收 `Iterable<T>` 比接收 `T[]` 更通用：数组、`Set`、生成器都能传进来。

## 生成器

自己实现迭代器（写一个带 `next()` 的对象，手动维护状态）很繁琐。**生成器函数** 让这件事变得简单：

```ts
function* callIds(): Generator<string> {
  let n = 1;
  while (true) {
    yield `call_${n++}`;
  }
}

const ids = callIds();
ids.next().value; // "call_1"
ids.next().value; // "call_2"
```

- `function*` 声明一个生成器函数。调用它 **不会执行函数体**，而是返回一个生成器对象（它既是迭代器，也是可迭代对象）
- 每次调用 `next()`，函数体从上次暂停的地方继续执行，直到遇到下一个 `yield`，把 `yield` 后面的值交出去，然后再次暂停
- 函数体执行完（或者 `return`），`next()` 返回 `{ done: true }`

因为是"要一个，算一个"，生成器可以表示无限的序列，`while (true)` 也不会卡死。这和 Python 的生成器是同一个概念，语法也几乎一样。

生成器的完整类型是 `Generator<T, TReturn, TNext>`：`yield` 出去的值的类型、`return` 的值的类型，以及外部通过 `next(值)` 传进来的值的类型。后两个很少用到，写成 `Generator<string>` 即可，它们有默认值。

## 异步迭代

把"每次 `next()` 返回 `{ value, done }`"换成"每次 `next()` 返回 **一个 Promise**，兑现为 `{ value, done }`"，就得到了 **异步迭代协议**。对应的：

| 同步                  | 异步                        |
| --------------------- | --------------------------- |
| `[Symbol.iterator]()` | `[Symbol.asyncIterator]()`  |
| `Iterable<T>`         | `AsyncIterable<T>`          |
| `for (const x of xs)` | `for await (const x of xs)` |
| `function*`           | `async function*`           |
| `Generator<T>`        | `AsyncGenerator<T>`         |

**异步生成器** 是生成器和 async 函数的结合：既可以 `yield`，也可以 `await`。

```ts
async function* fakeTokens(text: string, delayMs = 5): AsyncGenerator<string> {
  for (const char of text) {
    await sleep(delayMs); // 模拟网络上一个个到达的 token
    yield char;
  }
}

for await (const token of fakeTokens("你好，世界")) {
  process.stdout.write(token);
}
```

`for await` 每一轮都等下一个值到达，到达后执行循环体，然后再去要下一个。用起来和普通的 `for...of` 一样直观，这就是为什么几乎所有的模型 SDK 都把流式输出设计成一个异步可迭代对象：

```ts
// 各家 SDK 的流式接口都长这样
for await (const chunk of client.chat.completions.create({ model, messages, stream: true })) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
```

其实你已经用过一个了：[第 0 章项目的 cli.ts](../00-setup/project/cli.ts) 里的 `for await (const line of rl)`，`readline` 把用户的每一行输入变成一个异步可迭代对象。下一节要讲的 `ReadableStream` 也是。

## 拉取式：消费者决定节奏

```ts
async function* noisy(): AsyncGenerator<number> {
  for (let i = 1; i <= 3; i++) {
    console.log(`生产 ${i}`);
    yield i;
  }
}

for await (const n of noisy()) {
  console.log(`消费 ${n}`);
}
// 生产 1 → 消费 1 → 生产 2 → 消费 2 → 生产 3 → 消费 3
```

输出是交替的。生成器在 `yield` 处暂停，直到消费者来要下一个值才继续。如果循环体里有一个很慢的 `await`（比如把每一块写进文件），生成器就会等着，不会无限制地往内存里堆数据。这种"消费者跟不上时，生产者自动放慢"的特性叫 **背压**（backpressure），是处理长时间数据流时非常重要的性质。

## 提前退出和清理

用户按下 Ctrl+C，或者你已经拿到了需要的内容，想提前结束循环：

```ts
async function* stream(): AsyncGenerator<string> {
  console.log("打开连接");
  try {
    for (let i = 1; ; i++) {
      await sleep(1);
      yield `块 ${i}`;
    }
  } finally {
    console.log("关闭连接");
  }
}

for await (const chunk of stream()) {
  if (chunk === "块 2") {
    break;
  }
}
// 打开连接 → …… → 关闭连接
```

`break`、`return`，或者循环体里抛出异常，都会让 `for await` 调用迭代器的 `return()` 方法。对生成器来说，效果是：它在暂停的那个 `yield` 处 **像遇到了 `return` 一样** 结束，`finally` 块照常执行。所以 **生成器的清理工作写在 `finally` 里**，无论消费者是正常读完、提前退出还是出错，资源都会被释放。

反过来，生成器内部抛出的异常（比如连接断开）会在消费者的 `for await` 处抛出，用 `try/catch` 包住循环就能处理。

## 组合：管道

异步生成器可以接收另一个异步可迭代对象作为输入，产出变换后的结果。几个小函数就能组合出处理流水线：

```ts
async function* mapAsync<T, R>(source: AsyncIterable<T>, fn: (item: T) => R): AsyncGenerator<R> {
  for await (const item of source) {
    yield fn(item);
  }
}

async function* take<T>(source: AsyncIterable<T>, count: number): AsyncGenerator<T> {
  if (count <= 0) return;
  let taken = 0;
  for await (const item of source) {
    yield item;
    if (++taken >= count) return;
  }
}

for await (const token of take(
  mapAsync(fakeTokens("abcdefg"), (t) => t.toUpperCase()),
  3,
)) {
  // "A"、"B"、"C"
}
```

整条管道仍然是拉取式的：最外层的 `for await` 要一个值，`take` 就向 `mapAsync` 要一个，`mapAsync` 再向 `fakeTokens` 要一个。`take` 拿够了就 `return`，它的 `for await` 随之结束，于是又调用了上游的 `return()`。**清理会沿着管道一路传上去**，最上游的连接也会被关闭。

章末项目的流式客户端就是这样一条管道：字节流 → 文本 → 行 → SSE 事件 → JSON → 文本片段和工具调用。

参数类型写 `AsyncIterable<T>`（最通用的"能被 `for await` 遍历的东西"），返回类型写 `AsyncGenerator<T>`（调用方可能需要 `return()` 等方法）。

## 几个要注意的地方

- **生成器函数体在第一次 `next()` 时才开始执行。** 调用 `stream()` 时什么都不会发生，连"打开连接"都不会打印。所以参数校验之类"应该立刻报错"的逻辑，放在生成器里会被推迟到第一次迭代
- **一个生成器只能遍历一次。** 遍历完（或提前退出）之后，再 `for await` 它什么也得不到。需要多次遍历时，每次重新调用生成器函数
- **`for await` 也能遍历同步的可迭代对象**，比如一个 Promise 数组，它会逐个 `await`。但这和 `Promise.all` 不同：如果后面的 Promise 先失败了，那时还没有人在等它，会造成未处理的拒绝（和 3.3 节"先启动、后等待"是同一个问题）

## 小结

- 迭代器每次 `next()` 返回一个值；异步迭代器每次返回一个 Promise；`for await` 逐个等待
- 生成器（`function*`）和异步生成器（`async function*`）用 `yield` 产生值，在 `yield` 处暂停，按需执行
- 拉取式：消费者决定节奏，生产者在 `yield` 处等待，天然具有背压
- 提前退出时生成器的 `finally` 会执行，清理会沿着管道传到上游；生成器里的异常在 `for await` 处抛出
- 参数用 `AsyncIterable<T>`，返回用 `AsyncGenerator<T>`；小的生成器可以组合成处理管道

## 练习

[exercises/03-async/08-stream-tools.ts](../../exercises/03-async/08-stream-tools.ts)：实现处理异步流的一组工具：`collect`、`take`、`mapAsync`、`batch`，以及"太久没有新数据就超时"的 `idleTimeout`。运行 `pnpm ex 08-stream-tools`。

下一节：[3.9 流与 SSE：解析流式响应](09-streams-and-sse.md)
