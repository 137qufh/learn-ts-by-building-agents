// 4.4 声明文件
// 运行：pnpm tsx chapters/04-tooling/examples/04-declaration-files.ts

// ── 1. 给没有类型的 JavaScript 补上声明 ──────────────────────────────────
// vendor/legacy-math.js 是纯 JavaScript。TypeScript 会找到旁边的 legacy-math.d.ts，
// 所以这里的 round 和 stats 都有准确的类型。把鼠标悬停在它们上面看看。
import legacyMath, { round, stats, type Stats } from "./vendor/legacy-math.js";

console.log(round(3.14159)); // 3.14
console.log(legacyMath.round(2.71828, 3)); // 2.718

const result: Stats | null = stats([3, 1, 4, 1, 5]);
// result 可能是 null，必须先检查。没有声明文件的话，这里的一切都是 any，什么错都查不出来
if (result !== null) {
  console.log(result.mean); // 2.8
}
// round("3.14"); // 取消注释试试：error TS2345，字符串不能传给 number 参数

// ── 2. 模块扩充：往别人的接口里加东西 ────────────────────────────────────
import { emit, on } from "./vendor/event-bus.ts";

declare module "./vendor/event-bus.ts" {
  interface Events {
    "tool:start": { tool: string; input: string };
    "tool:end": { tool: string; ms: number };
  }
}

on("tool:start", ({ tool, input }) => console.log(`开始 ${tool}(${input})`));
on("tool:end", ({ tool, ms }) => console.log(`结束 ${tool}，用时 ${ms}ms`));
emit("tool:start", { tool: "search", input: "TypeScript" }); // 开始 search(TypeScript)
emit("tool:end", { tool: "search", ms: 12 }); // 结束 search，用时 12ms
// emit("tool:end", { tool: "search" }); // 取消注释试试：缺少 ms
// emit("tool:typo", {}); // 取消注释试试：没有这个事件

// ── 3. 全局声明：描述运行时环境里本来就有的全局变量 ──────────────────────
declare global {
  // 只能用 var：全局作用域里 let/const 声明的变量不会成为 globalThis 的属性
  var __AGENT_DEBUG__: boolean | undefined;
}

globalThis.__AGENT_DEBUG__ = true;
console.log(__AGENT_DEBUG__); // true
