// 6.3 并行执行工具：超时与取消
// 运行：pnpm tsx chapters/06-harness/examples/03-parallel-tools.ts

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason as Error);
    });
  });

// ── 1. 顺序 vs 并行 ────────────────────────────────────────────────
const tasks = [200, 100, 150];
let start = performance.now();
for (const ms of tasks) await sleep(ms);
console.log(`顺序执行：${Math.round(performance.now() - start)}ms`); // 大约 450ms

start = performance.now();
await Promise.all(tasks.map((ms) => sleep(ms)));
console.log(`并行执行：${Math.round(performance.now() - start)}ms`); // 大约 200ms，最慢的那个

// ── 2. Promise 没法被"杀死"：只能不再等它 ─────────────────────────────
// 这个工具完全忽略 signal
async function stubbornTool(): Promise<string> {
  await sleep(300);
  console.log("  （不听话的工具在 300ms 后还是跑完了，但已经没有人在等它）");
  return "迟到的结果";
}

function withTimeout(task: Promise<string>, ms: number): Promise<string> {
  return Promise.race([task, sleep(ms).then(() => `超过 ${ms}ms 没有完成，已停止`)]);
}

start = performance.now();
const result = await withTimeout(stubbornTool(), 100);
console.log(`超时：${Math.round(performance.now() - start)}ms 就拿到了结果："${result}"`); // 大约 100ms
await sleep(250); // 等着看那条迟到的日志

// ── 3. 听话的工具：把 signal 一路传下去 ─────────────────────────────
async function politeTool(signal: AbortSignal): Promise<string> {
  await sleep(1000, signal); // 真实的工具会把 signal 传给 fetch、子进程、文件读取……
  return "完成";
}

const controller = new AbortController();
setTimeout(() => controller.abort(new DOMException("超时", "TimeoutError")), 50);
try {
  await politeTool(controller.signal);
} catch (error) {
  console.log(`\n听话的工具收到信号就停了：${(error as Error).name}`); // TimeoutError
}

// ── 4. 同步抛出：Promise.try 把它变成拒绝 ─────────────────────────────
const careless = (input: string): Promise<string> => {
  if (input === "") throw new Error("参数不能为空"); // 还没来得及返回 Promise
  return Promise.resolve(input);
};

try {
  void careless("").then(() => {}); // .then 根本来不及调用，错误同步地冒出来
} catch (error) {
  console.log(
    `\n没有包装：错误同步地抛了出来（${(error as Error).message}）。在 calls.map(...) 里，整个 map 会直接中断`,
  );
}
const wrapped = await Promise.try(() => careless("")).then(
  () => "ok",
  (error: unknown) => `工具执行失败：${(error as Error).message}`,
);
console.log(`Promise.try 包装之后：${wrapped}`); // 工具执行失败：参数不能为空

// ── 5. 结果按调用的顺序，通知按完成的顺序 ────────────────────────────
const calls = [
  { name: "slow", ms: 60 },
  { name: "fast", ms: 10 },
  { name: "mid", ms: 30 },
];
const finished: string[] = [];
const results = await Promise.all(
  calls.map(async (call) => {
    await sleep(call.ms);
    finished.push(call.name); // 界面可以先显示先完成的
    return call.name;
  }),
);
console.log(`\n完成的顺序：${finished.join(", ")}`); // fast, mid, slow
console.log(`结果的顺序：${results.join(", ")}`); //   slow, fast, mid（和调用的顺序一样）
