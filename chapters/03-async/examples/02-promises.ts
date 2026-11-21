// 3.2 Promise：创建、链式调用、错误传播
// 运行：pnpm tsx chapters/03-async/examples/02-promises.ts
//
// 这一节演示 then 链本身，所以很多链的末尾故意没有 await 或 catch（4.5 节会讲这条 lint 规则）
/* eslint-disable @typescript-eslint/no-floating-promises */

// ── 1. 用 new Promise 包装一个基于回调的 API ─────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// 一个"老式"的回调风格 API：第一个参数是错误，第二个是结果（Node.js 的惯例）
function legacyLoadPrompt(
  name: string,
  callback: (error: Error | null, text?: string) => void,
): void {
  setTimeout(() => {
    if (name === "system") {
      callback(null, "你是一个乐于助人的助手。");
    } else {
      callback(new Error(`找不到提示词：${name}`));
    }
  }, 5);
}

function loadPrompt(name: string): Promise<string> {
  return new Promise((resolve, reject) => {
    legacyLoadPrompt(name, (error, text) => {
      if (error) {
        reject(error);
      } else {
        resolve(text ?? "");
      }
    });
  });
}

// ── 2. then 返回一个新的 Promise：链式调用 ────────────────────────────
const lengthPromise: Promise<number> = loadPrompt("system")
  .then((text) => text.trim()) // Promise<string>
  .then((text) => text.length); // Promise<number>

lengthPromise.then((length) => console.log("提示词长度：", length)); // 提示词长度： 12

// ── 3. 回调返回 Promise 时会被"展平"，不会得到 Promise<Promise<...>> ───────
const both: Promise<string> = loadPrompt("system").then((text) =>
  sleep(5).then(() => `${text}（延迟加载）`),
);
both.then(console.log); // 你是一个乐于助人的助手。（延迟加载）

// ── 4. 错误沿着链往下传，直到遇到 catch ──────────────────────────────
await sleep(20); // 等上面的输出完成，让各段的输出不交错
loadPrompt("planner")
  .then((text) => {
    console.log("不会执行：", text);
    return text.length;
  })
  .catch((error: unknown) => {
    // catch 的参数在标准库里是 any，自己标注成 unknown 更安全
    console.log("出错了：", error instanceof Error ? error.message : error); // 出错了： 找不到提示词：planner
    return 0; // catch 返回值，链就"恢复"了：后面的 then 拿到 0
  })
  .then((length) => console.log("恢复后的长度：", length)) // 恢复后的长度： 0
  .finally(() => console.log("finally：无论成功失败都会执行")); // finally：无论成功失败都会执行

// ── 5. then 里抛出的异常也会变成 rejection ────────────────────────────
await sleep(20);
Promise.resolve("{ 不是 JSON")
  .then((text) => JSON.parse(text) as unknown)
  .catch((error: unknown) => console.log("解析失败：", error instanceof SyntaxError)); // 解析失败： true

// ── 6. Promise.withResolvers：把 resolve 拿到外面 ─────────────────────
await sleep(20);
const { promise: userConfirmed, resolve: confirm } = Promise.withResolvers<boolean>();
setTimeout(() => confirm(true), 5); // 比如：用户在终端里按了 y
console.log("用户确认了吗？", await userConfirmed); // 用户确认了吗？ true

// ── 7. 一个 Promise 只会完成一次 ─────────────────────────────────────
const once = new Promise<string>((resolve, reject) => {
  resolve("第一次");
  resolve("第二次"); // 被忽略
  reject(new Error("也被忽略"));
});
console.log(await once); // 第一次
