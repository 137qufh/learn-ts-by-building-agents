// 3.5 并发：Promise.all / allSettled / race / any，以及限制并发数
// 运行：pnpm tsx chapters/03-async/examples/05-concurrency.ts

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchProfile(): Promise<{ name: string }> {
  await sleep(20);
  return { name: "Matt" };
}
async function fetchModels(): Promise<string[]> {
  await sleep(30);
  return ["gpt-5", "claude-sonnet-4-5"];
}
async function failAfter(ms: number, message: string): Promise<never> {
  await sleep(ms);
  throw new Error(message);
}

// ── 1. Promise.all：全部成功才成功，类型按位置保留 ─────────────────────
const [profile, models] = await Promise.all([fetchProfile(), fetchModels()]);
console.log(profile.name, models.length); // Matt 2   （profile: { name: string }，models: string[]）

// 任何一个失败，整体立刻失败；其他的仍在后台运行，但结果被丢弃
try {
  await Promise.all([fetchModels(), failAfter(10, "工具 A 崩溃了")]);
} catch (error) {
  console.log("all 失败：", error instanceof Error && error.message); // all 失败： 工具 A 崩溃了
}

// ── 2. Promise.allSettled：等全部完成，逐个查看成败 ────────────────────
const settled = await Promise.allSettled([fetchModels(), failAfter(10, "工具 B 超时")]);
for (const result of settled) {
  if (result.status === "fulfilled") {
    console.log("成功：", result.value); // 成功： [ 'gpt-5', 'claude-sonnet-4-5' ]
  } else {
    console.log("失败：", result.reason instanceof Error && result.reason.message); // 失败： 工具 B 超时
  }
}
// filter 的回调会被推断成类型守卫（TS 5.5+），过滤后 value 的类型是确定的
const values = settled
  .filter((result) => result.status === "fulfilled")
  .map((result) => result.value);
console.log(values.length); // 1

// ── 3. Promise.race：谁先完成（无论成败）就用谁 ────────────────────────
const winner = await Promise.race([sleep(50).then(() => "慢的"), sleep(10).then(() => "快的")]);
console.log("race：", winner); // race： 快的

// ── 4. Promise.any：第一个成功的；全部失败才失败 ───────────────────────
const firstOk = await Promise.any([failAfter(5, "镜像 1 挂了"), sleep(20).then(() => "镜像 2")]);
console.log("any：", firstOk); // any： 镜像 2
try {
  await Promise.any([failAfter(5, "a"), failAfter(10, "b")]);
} catch (error) {
  if (error instanceof AggregateError) {
    console.log("any 全部失败：", error.errors.length, "个错误"); // any 全部失败： 2 个错误
  }
}

// ── 5. 限制并发数：同时最多 limit 个 ──────────────────────────────────
async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++; // 同步地"领取"一个下标：单线程，不会有两个 worker 领到同一个
      results[index] = await fn(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

let running = 0;
let peak = 0;
const pages = await mapWithLimit([1, 2, 3, 4, 5, 6, 7], 3, async (page) => {
  running++;
  peak = Math.max(peak, running);
  await sleep(10);
  running--;
  return `第 ${page} 页`;
});
console.log(pages.join("、"), "| 最多同时", peak, "个"); // 第 1 页、第 2 页、……、第 7 页 | 最多同时 3 个
