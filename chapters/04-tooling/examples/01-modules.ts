// 4.1 模块：ESM 与 CommonJS
// 运行：pnpm tsx chapters/04-tooling/examples/01-modules.ts
//
// 这个示例在临时目录里现场写出几个小模块，再导入它们，这样每一种行为都是真实运行的结果。

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "modules-demo-"));
function write(name: string, code: string): string {
  const file = join(dir, name);
  writeFileSync(file, code);
  return file;
}
/** 动态导入一个文件：import() 需要 URL（或者相对路径），绝对路径要先转成 file:// URL */
function importFile(file: string): Promise<Record<string, unknown>> {
  return import(pathToFileURL(file).href) as Promise<Record<string, unknown>>;
}

// ── 1. ESM 的导出是"活的绑定" ────────────────────────────────────────
const counter = write(
  "counter.mjs",
  `export let count = 0;
   export function increment() { count++; }
   export default "我是默认导出";`,
);
const counterModule = await importFile(counter);
console.log(counterModule.count); // 0
(counterModule.increment as () => void)();
console.log(counterModule.count); // 1：导入方看到的是同一个变量，而不是一份拷贝
console.log(counterModule.default); // 我是默认导出

// ── 2. 从 ESM 导入 CommonJS：module.exports 就是默认导出 ────────────────
const cjsObject = write(
  "tools.cjs",
  `exports.add = (a, b) => a + b;
   exports.version = "1.0";`,
);
const tools = await importFile(cjsObject);
console.log(Object.keys(tools).sort()); // [ 'add', 'default', 'module.exports', 'version' ]
// Node 静态分析了 exports.xxx = ... 这样的写法，所以也能按名字导入
console.log((tools.add as (a: number, b: number) => number)(1, 2)); // 3

const cjsFunction = write(
  "greet.cjs",
  `module.exports = function greet(name) { return "你好，" + name; };`,
);
const greet = await importFile(cjsFunction);
console.log(Object.keys(greet).sort()); // [ 'default', 'module.exports' ]：整个 module.exports 只能作为默认导出
console.log((greet.default as (name: string) => string)("TS")); // 你好，TS

// ── 3. 从 CommonJS（require）加载 ESM ────────────────────────────────
const require = createRequire(import.meta.url);
const esm = write("esm-lib.mjs", `export const answer = 42; export default "默认";`);
const loaded = require(esm) as Record<string, unknown>;
console.log(loaded.answer, loaded.default); // 42 默认：得到的是模块命名空间对象

const asyncEsm = write("async-lib.mjs", `await Promise.resolve(); export const ready = true;`);
try {
  require(asyncEsm);
} catch (error) {
  // 含有顶层 await 的模块不能被同步地 require
  console.log((error as NodeJS.ErrnoException).code); // ERR_REQUIRE_ASYNC_MODULE
}

// ── 4. import.meta：当前模块的信息 ───────────────────────────────────
console.log(import.meta.filename.endsWith("01-modules.ts")); // true，相当于 CommonJS 的 __filename
console.log(import.meta.dirname.endsWith("examples")); // true，相当于 __dirname
console.log(import.meta.resolve("./01-modules.ts").startsWith("file://")); // true：解析成 URL，但不加载

// ── 5. 动态 import()：运行时才决定加载哪个模块 ────────────────────────
const plugins = [
  write("plugin-a.mjs", `export default { name: "a", run: () => "A 运行了" };`),
  write("plugin-b.mjs", `export default { name: "b", run: () => "B 运行了" };`),
];
for (const file of plugins) {
  const plugin = (await importFile(file)).default as { name: string; run: () => string };
  console.log(plugin.name, plugin.run()); // a A 运行了 / b B 运行了
}

// ── 6. 导入 JSON 需要写明类型 ─────────────────────────────────────────
const config = write("config.json", `{ "model": "fake-model" }`);
const json = (await import(pathToFileURL(config).href, { with: { type: "json" } })) as {
  default: { model: string };
};
console.log(json.default.model); // fake-model

rmSync(dir, { recursive: true, force: true });
