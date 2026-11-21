// 3.8 异步迭代器与生成器：一个一个地产生值
// 运行：pnpm tsx chapters/03-async/examples/08-async-iterators.ts

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 1. 生成器：按需产生值，可以是无限的 ───────────────────────────────
function* callIds(): Generator<string> {
  let n = 1;
  while (true) {
    yield `call_${n++}`; // 每次 next() 运行到这里暂停，把值交出去
  }
}
const ids = callIds();
console.log(ids.next().value, ids.next().value, ids.next().value); // call_1 call_2 call_3

// ── 2. 异步生成器：在 yield 之间可以 await ─────────────────────────────
async function* fakeTokens(text: string, delayMs = 5): AsyncGenerator<string> {
  for (const char of text) {
    await sleep(delayMs); // 模拟网络上一个个到达的 token
    yield char;
  }
}

let output = "";
for await (const token of fakeTokens("你好，世界")) {
  output += token;
}
console.log(output); // 你好，世界

// ── 3. 拉取式：消费者不要，生产者就不会继续 ────────────────────────────
async function* noisy(): AsyncGenerator<number> {
  for (let i = 1; i <= 3; i++) {
    console.log(`  生产 ${i}`);
    yield i;
  }
}
for await (const n of noisy()) {
  console.log(`  消费 ${n}`);
}
//   生产 1 → 消费 1 → 生产 2 → 消费 2 → 生产 3 → 消费 3（交替进行，而不是先生产完）

// ── 4. 提前退出时，生成器的 finally 会执行（用来清理资源） ─────────────
async function* stream(): AsyncGenerator<string> {
  console.log("  打开连接");
  try {
    for (let i = 1; ; i++) {
      await sleep(1);
      yield `块 ${i}`;
    }
  } finally {
    console.log("  关闭连接"); // break 时也会执行
  }
}
for await (const chunk of stream()) {
  console.log(`  收到 ${chunk}`);
  if (chunk === "块 2") {
    break; // for await 会调用迭代器的 return()，生成器在 yield 处"返回"，执行 finally
  }
}
// 打开连接 → 收到 块 1 → 收到 块 2 → 关闭连接

// ── 5. 用生成器组合出处理管道 ──────────────────────────────────────────
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
    if (++taken >= count) return; // 提前返回：同样会关闭上游
  }
}
const upper: string[] = [];
for await (const token of take(
  mapAsync(fakeTokens("abcdefg", 1), (t) => t.toUpperCase()),
  3,
)) {
  upper.push(token);
}
console.log(upper.join("")); // ABC

// ── 6. 生成器里抛出的异常，在 for await 处抛出 ────────────────────────
async function* broken(): AsyncGenerator<string> {
  yield "正常的一块";
  throw new Error("连接断开");
}
try {
  for await (const chunk of broken()) {
    console.log(chunk); // 正常的一块
  }
} catch (error) {
  console.log("捕获：", error instanceof Error && error.message); // 捕获： 连接断开
}
