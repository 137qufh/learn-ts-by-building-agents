// 3.3 async/await：用同步的写法写异步代码
// 运行：pnpm tsx chapters/03-async/examples/03-async-await.ts

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 模拟一个耗时 30ms 的模型调用
async function callModel(prompt: string): Promise<string> {
  await sleep(30);
  if (prompt.includes("出错")) {
    throw new Error(`模型拒绝了：${prompt}`);
  }
  return `回答：${prompt}`;
}

// ── 1. async 函数总是返回 Promise ────────────────────────────────────
async function getModelName(): Promise<string> {
  return "gpt-5"; // 返回普通值，调用方拿到的是 Promise<string>
}
const namePromise = getModelName();
console.log(namePromise instanceof Promise, await namePromise); // true gpt-5

// ── 2. await 拿到兑现的值；拒绝变成异常，用 try/catch 处理 ──────────────
try {
  const reply = await callModel("你好"); // string
  console.log(reply); // 回答：你好
  await callModel("出错吧");
  console.log("不会执行");
} catch (error) {
  // error 是 unknown（严格模式）
  console.log("捕获：", error instanceof Error ? error.message : error); // 捕获： 模型拒绝了：出错吧
} finally {
  console.log("finally 照常执行"); // finally 照常执行
}

// ── 3. 顺序执行 vs 并发执行 ───────────────────────────────────────────
const prompts = ["一", "二", "三"];

let start = performance.now();
const sequential: string[] = [];
for (const prompt of prompts) {
  sequential.push(await callModel(prompt)); // 一个接一个：约 90ms
}
console.log(
  "顺序：",
  sequential.length,
  "个结果，耗时约",
  roundTo30(performance.now() - start),
  "ms",
); // 顺序： 3 个结果，耗时约 90 ms

start = performance.now();
const parallel = await Promise.all(prompts.map((prompt) => callModel(prompt))); // 同时发出：约 30ms
console.log(
  "并发：",
  parallel.length,
  "个结果，耗时约",
  roundTo30(performance.now() - start),
  "ms",
); // 并发： 3 个结果，耗时约 30 ms

// ── 4. forEach 不会等待 async 回调 ────────────────────────────────────
const done: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-misused-promises -- 故意演示这个错误
prompts.forEach(async (prompt) => {
  done.push(await callModel(prompt));
});
console.log("forEach 之后立刻查看：", done.length); // forEach 之后立刻查看： 0
await sleep(50);
console.log("等一会儿再看：", done.length); // 等一会儿再看： 3

// ── 5. return 和 return await 在 try 里的区别 ──────────────────────────
async function withoutAwait(): Promise<string> {
  try {
    return callModel("出错了"); // 直接返回 Promise：它的拒绝发生在函数返回之后，catch 接不住
  } catch {
    return "在函数内部处理了";
  }
}
async function withAwait(): Promise<string> {
  try {
    return await callModel("出错了"); // 先等它完成：拒绝在 try 里变成异常，被 catch 接住
  } catch {
    return "在函数内部处理了";
  }
}
console.log(await withoutAwait().catch(() => "错误逃出了函数")); // 错误逃出了函数
console.log(await withAwait()); // 在函数内部处理了

// ── 6. Awaited + ReturnType：拿到 async 函数"真正"的返回类型 ─────────────
type Reply = Awaited<ReturnType<typeof callModel>>; // string
const typed: Reply = await callModel("类型");
console.log(typed); // 回答：类型

function roundTo30(ms: number): number {
  return Math.round(ms / 30) * 30;
}
