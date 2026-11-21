// 4.8 调试与性能分析
// 运行：pnpm tsx chapters/04-tooling/examples/08-debugging-and-profiling.ts

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";

// ── 1. source map：让编译产物的报错指回源码 ───────────────────────────────
const dir = mkdtempSync(join(tmpdir(), "sourcemap-demo-"));
mkdirSync(join(dir, "src"));
writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
writeFileSync(
  join(dir, "src/main.ts"),
  `interface Config {
  model: string;
}

function load(text: string): Config {
  const data = JSON.parse(text) as Partial<Config>;
  if (data.model === undefined) {
    throw new Error("配置里缺少 model");
  }
  return { model: data.model };
}

load("{}");
`,
);
const require = createRequire(import.meta.url);
const tsc = join(dirname(require.resolve("typescript7/package.json")), "bin/tsc");
execFileSync(
  process.execPath,
  [
    tsc,
    join(dir, "src/main.ts"),
    "--outDir",
    join(dir, "dist"),
    "--sourceMap",
    "--target",
    "es2025",
    "--module",
    "nodenext",
    "--types",
    "",
  ],
  { cwd: dir },
); // 在没有 tsconfig.json 的目录里运行，否则 tsc 会拒绝"命令行上指定文件"

function firstStackLine(args: string[]): string {
  try {
    execFileSync(process.execPath, [...args, join(dir, "dist/main.js")], { stdio: "pipe" });
    return "（没有报错）";
  } catch (error) {
    const stderr = String((error as { stderr: unknown }).stderr);
    const line = stderr.split("\n").find((l) => l.trim().startsWith("at ")) ?? "";
    return line.trim().replace(dir, "…");
  }
}
console.log("不带 source map：", firstStackLine([])); // at load (file://…/dist/main.js:4:15)
console.log("带 source map：  ", firstStackLine(["--enable-source-maps"])); // at load (…/src/main.ts:8:11)
rmSync(dir, { recursive: true, force: true });

// ── 2. performance.mark / measure：给一段代码计时 ─────────────────────────
performance.mark("parse:start");
let total = 0;
for (let i = 0; i < 200_000; i++) {
  total += JSON.parse(`{"n":${i}}`).n as number;
}
performance.mark("parse:end");
const measure = performance.measure("parse", "parse:start", "parse:end");
console.log(`\n解析 20 万个 JSON：${measure.duration.toFixed(1)}ms（总和 ${total}）`);

// performance.now() 是单调时钟：不受系统时间调整的影响，适合计时；Date.now() 适合表示"现在几点"

// ── 3. 事件循环延迟：同步代码会卡住所有异步任务 ─────────────────────────
const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();
await new Promise((resolve) => setTimeout(resolve, 50)); // 空闲 50ms
const blockStart = performance.now();
while (performance.now() - blockStart < 100) {
  // 故意同步地忙等 100ms：这期间任何定时器、网络回调都没法执行
}
await new Promise((resolve) => setTimeout(resolve, 20));
histogram.disable();
console.log(
  `\n事件循环延迟：p50 ${(histogram.percentile(50) / 1e6).toFixed(0)}ms，` +
    `最大 ${(histogram.max / 1e6).toFixed(0)}ms`,
); // 最大值接近 100ms：那 100ms 里事件循环被卡住了

// ── 4. 内存 ──────────────────────────────────────────────────────────────
const before = process.memoryUsage().heapUsed;
const big = Array.from({ length: 1_000_000 }, (_, i) => ({ i }));
const after = process.memoryUsage().heapUsed;
console.log(`\n一百万个小对象大约占用 ${((after - before) / 1024 / 1024).toFixed(0)}MB 堆内存`);
console.log(big.length); // 保持引用，否则它可能在测量之前就被回收
