/**
 * 练习 3-1：预测执行顺序
 *
 * 课程：chapters/03-async/01-event-loop.md
 * 运行：pnpm ex 01-event-order
 *
 * 下面有五段代码（谜题），每段都会调用 log 输出几条信息。不要运行它们，先在脑子里
 * 按事件循环的规则推演一遍，把你预测的输出顺序写进文件末尾的 predictions 里。
 * 测试会真的运行每段代码，检查你的预测对不对。
 *
 * - 谜题 1 只需要 3.1 节的知识
 * - 谜题 2、3 用到了 Promise 的细节，学完 3.2 节再做
 * - 谜题 4、5 用到了 async/await，学完 3.3 节再做
 *
 * 规则：不要修改谜题本身。预测错了，测试只会告诉你"不对"，不会告诉你正确答案；
 * 想不通时，可以把谜题复制到一个单独的文件里运行，然后对照课程想清楚"为什么"。
 */
/** 记录一条输出。测试会把所有输出按顺序收集起来，和你的预测比较。 */
export type Log = (message: string) => void;

/** 等所有回调都执行完（谜题里最长的定时器是 20ms）。 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

// ── 谜题 1：同步、微任务、定时器 ─────────────────────────────────────
export function puzzle1(log: Log): Promise<void> {
  log("A");
  setTimeout(() => log("B"), 0);
  Promise.resolve().then(() => log("C"));
  log("D");
  return settle();
}

// ── 谜题 2：两条 then 链 ─────────────────────────────────────────────
export function puzzle2(log: Log): Promise<void> {
  Promise.resolve()
    .then(() => log("a1"))
    .then(() => log("a2"))
    .then(() => log("a3"));
  Promise.resolve()
    .then(() => log("b1"))
    .then(() => log("b2"));
  return settle();
}

// ── 谜题 3：new Promise 里的代码什么时候执行 ──────────────────────────
export function puzzle3(log: Log): Promise<void> {
  log("A");
  const promise = new Promise<void>((resolve) => {
    log("B");
    resolve();
    log("C");
  });
  promise.then(() => log("D"));
  log("E");
  return settle();
}

// ── 谜题 4：async 函数在第一个 await 之前是同步的 ───────────────────────
export function puzzle4(log: Log): Promise<void> {
  async function step(name: string): Promise<void> {
    log(`${name} 开始`);
    await null;
    log(`${name} 结束`);
  }
  log("前");
  void step("x");
  void step("y");
  log("后");
  return settle();
}

// ── 谜题 5：全部混在一起 ─────────────────────────────────────────────
export function puzzle5(log: Log): Promise<void> {
  setTimeout(() => log("定时器 1"), 0);
  void (async () => {
    log("async 开始");
    await null;
    log("第一个 await 之后");
    setTimeout(() => log("定时器 2"), 0);
    await null;
    log("第二个 await 之后");
  })();
  Promise.resolve().then(() => log("then"));
  setTimeout(() => log("20ms 的定时器"), 20);
  log("同步结束");
  return settle();
}

// ── 你的预测 ─────────────────────────────────────────────────────────

export const predictions: Record<
  "puzzle1" | "puzzle2" | "puzzle3" | "puzzle4" | "puzzle5",
  string[]
> = {
  puzzle1: [],
  puzzle2: [],
  puzzle3: [],
  puzzle4: [],
  puzzle5: [],
};
