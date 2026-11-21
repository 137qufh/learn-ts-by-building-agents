// 3.6 取消与超时：AbortController 和 AbortSignal
// 运行：pnpm tsx chapters/03-async/examples/06-cancellation.ts

import { createServer } from "node:http";

// ── 1. 基本用法：controller 负责取消，signal 负责通知 ──────────────────
const controller = new AbortController();
const { signal } = controller;
signal.addEventListener("abort", () => console.log("收到取消通知，原因：", signal.reason), {
  once: true,
});
console.log("取消前：", signal.aborted); // 取消前： false
controller.abort("用户按了 Ctrl+C"); // 收到取消通知，原因： 用户按了 Ctrl+C
console.log("取消后：", signal.aborted); // 取消后： true
controller.abort("再取消一次"); // 没有效果：一个 signal 只会被取消一次

// 不传原因时，reason 是一个 name 为 "AbortError" 的 DOMException
const plain = new AbortController();
plain.abort();
console.log((plain.signal.reason as DOMException).name); // AbortError

// ── 2. 让自己的函数支持取消 ──────────────────────────────────────────
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason); // 已经取消了：立刻拒绝，不启动定时器
      return;
    }
    const onAbort = () => {
      clearTimeout(timer); // 取消时：停掉定时器
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort); // 正常完成时：移除监听，避免泄漏
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const stopper = new AbortController();
setTimeout(() => stopper.abort(new Error("不等了")), 20);
const start = performance.now();
try {
  await sleep(1000, stopper.signal);
} catch (error) {
  const waited = Math.round((performance.now() - start) / 10) * 10;
  console.log(
    `sleep 被取消：${error instanceof Error ? error.message : error}，只等了约 ${waited}ms`,
  ); // sleep 被取消：不等了，只等了约 20ms
}

// ── 3. 超时：AbortSignal.timeout ─────────────────────────────────────
try {
  await sleep(1000, AbortSignal.timeout(15));
} catch (error) {
  console.log("超时：", error instanceof DOMException && error.name); // 超时： TimeoutError
}

// ── 4. 组合：用户取消 或 超时，哪个先到算哪个 ──────────────────────────
const user = new AbortController();
const combined = AbortSignal.any([user.signal, AbortSignal.timeout(1000)]);
setTimeout(() => user.abort(new Error("用户取消")), 10);
try {
  await sleep(500, combined);
} catch (error) {
  console.log("组合信号：", error instanceof Error && error.message); // 组合信号： 用户取消
}

// ── 5. fetch 也接受 signal（这里用一个本地服务器模拟很慢的模型 API） ─────────
const server = createServer((_request, response) => {
  const timer = setTimeout(() => response.end("终于好了"), 2000);
  response.on("close", () => clearTimeout(timer)); // 客户端断开时停止处理
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const url =
  typeof address === "object" && address !== null ? `http://127.0.0.1:${address.port}/` : "";

async function callSlowApi(options: { signal?: AbortSignal } = {}): Promise<string> {
  // exactOptionalPropertyTypes 下不能写 { signal: options.signal }（它可能是 undefined），
  // RequestInit 的 signal 允许 null，所以用 ?? null
  const response = await fetch(url, { signal: options.signal ?? null });
  return response.text();
}

try {
  await callSlowApi({ signal: AbortSignal.timeout(30) });
} catch (error) {
  console.log("fetch 超时：", error instanceof DOMException && error.name); // fetch 超时： TimeoutError
}
server.close();
