/**
 * 练习 3-1 参考答案：预测执行顺序
 *
 * 每个谜题的推演过程写在对应的预测旁边。
 *
 * 谜题考的是执行顺序，所以故意不等待某些 Promise、故意 await 普通的值（4.5 节会讲这两条 lint 规则）。
 */
/* eslint-disable @typescript-eslint/no-floating-promises, @typescript-eslint/await-thenable */
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

// ── 预测 ─────────────────────────────────────────────────────────────

export const predictions: Record<
  "puzzle1" | "puzzle2" | "puzzle3" | "puzzle4" | "puzzle5",
  string[]
> = {
  // 同步的 A、D 先执行完；然后清空微任务（C）；最后才是定时器（B）。
  puzzle1: ["A", "D", "C", "B"],

  // 两条链的第一个回调都在同步阶段排进了微任务队列：[a1, b1]。
  // a1 执行完，a2 才排进队列（排在 b1 后面）；b1 执行完，b2 排在 a2 后面……两条链交替前进。
  puzzle2: ["a1", "b1", "a2", "b2", "a3"],

  // 传给 new Promise 的函数（executor）是立刻同步执行的，resolve() 也不会中断它，所以 B、C 紧跟着 A。
  // then 的回调永远是异步的：即使 promise 已经完成，D 也要等同步代码（E）执行完。
  puzzle3: ["A", "B", "C", "E", "D"],

  // 调用 async 函数时，第一个 await 之前的代码是同步执行的，所以"x 开始""y 开始"紧跟着"前"。
  // 遇到 await，函数暂停并把后续部分作为微任务排队；同步代码（"后"）执行完以后，x、y 依次继续。
  puzzle4: ["前", "x 开始", "y 开始", "后", "x 结束", "y 结束"],

  // 同步阶段：输出"async 开始""同步结束"；微任务队列是 [async 函数的后续, then]，定时器队列是 [定时器 1]。
  // 微任务：先输出"第一个 await 之后"（并登记定时器 2，排在定时器 1 后面），再次 await 又排进一个微任务；
  // 接着执行 then；然后是刚排进来的"第二个 await 之后"。微任务清空后才轮到定时器：1、2，最后是 20ms 的那个。
  puzzle5: [
    "async 开始",
    "同步结束",
    "第一个 await 之后",
    "then",
    "第二个 await 之后",
    "定时器 1",
    "定时器 2",
    "20ms 的定时器",
  ],
};
