// 3.1 事件循环：同步代码、微任务、定时器的执行顺序
// 运行：pnpm tsx chapters/03-async/examples/01-event-loop.ts
//
// 第 2、3 段开头的 `await new Promise(...)` 只是为了让各段依次执行、互不干扰，
// 3.2 和 3.3 节会讲它们，现在只看每段里面的输出顺序即可。

// ── 1. 最基本的顺序 ──────────────────────────────────────────────
console.log("1 同步：开始");

setTimeout(() => {
  console.log("5 定时器（宏任务）");
}, 0);

Promise.resolve().then(() => {
  console.log("3 Promise 回调（微任务）");
});

queueMicrotask(() => {
  console.log("4 queueMicrotask（微任务）");
});

console.log("2 同步：结束");
// 输出顺序：1 → 2 → 3 → 4 → 5
// 同步代码先全部跑完；然后清空微任务队列；然后才轮到定时器。

// ── 2. 微任务可以继续产生微任务，它们都排在定时器前面 ──────────────
await new Promise<void>((resolve) => {
  setTimeout(() => {
    console.log("\n—— 第 2 段 ——");
    setTimeout(() => {
      console.log("c 定时器");
      resolve();
    }, 0);
    Promise.resolve()
      .then(() => console.log("a 微任务"))
      .then(() => console.log("b 微任务里产生的微任务"));
  }, 10);
});
// 输出：a → b → c

// ── 3. 阻塞事件循环：同步代码不让出，定时器只能干等 ──────────────────
await new Promise<void>((resolve) => {
  console.log("\n—— 第 3 段 ——");
  const scheduledAt = Date.now();
  setTimeout(() => {
    const waited = Date.now() - scheduledAt;
    console.log(`定时器本该 10ms 后执行，实际等了 ${waited >= 100 ? "100ms 以上" : `${waited}ms`}`);
    resolve();
  }, 10);

  // 一段耗时 100ms 的同步计算（忙等）。这期间事件循环被占住，什么回调都执行不了
  const start = Date.now();
  while (Date.now() - start < 100) {
    // 空转
  }
  console.log("同步计算结束");
});
// 输出：同步计算结束 → 定时器本该 10ms 后执行，实际等了 100ms 以上
