// 4.2 包的解析：exports 与 imports
// 运行：pnpm tsx chapters/04-tooling/examples/02-resolution.ts
//
// 在临时目录里搭一个小项目：node_modules 里放一个带 exports 的包，再看 Node 怎么解析各种导入。

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = mkdtempSync(join(tmpdir(), "resolution-demo-"));
function write(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

// ── 搭一个包：node_modules/tiny-kit ────────────────────────────────────
write(
  "node_modules/tiny-kit/package.json",
  JSON.stringify(
    {
      name: "tiny-kit",
      type: "module",
      exports: {
        ".": {
          types: "./dist/index.d.ts",
          "tiny-kit/source": "./src/index.ts",
          import: "./dist/index.js",
          require: "./dist/index.cjs",
        },
        "./tools/*": "./dist/tools/*.js",
        "./tools/internal-*": null,
        "./package.json": "./package.json",
      },
      imports: {
        "#log": { node: "./dist/log-node.js", default: "./dist/log-browser.js" },
      },
    },
    null,
    2,
  ),
);
write(
  "node_modules/tiny-kit/dist/index.js",
  `export { log } from "#log"; export const flavor = "esm";`,
);
write("node_modules/tiny-kit/dist/index.cjs", `exports.flavor = "cjs";`);
write("node_modules/tiny-kit/src/index.ts", `export const flavor: string = "source";`);
write("node_modules/tiny-kit/dist/log-node.js", `export const log = "node 版本的日志";`);
write("node_modules/tiny-kit/dist/log-browser.js", `export const log = "浏览器版本的日志";`);
write("node_modules/tiny-kit/dist/tools/search.js", `export default "search 工具";`);
write("node_modules/tiny-kit/dist/tools/internal-secret.js", `export default "不该被导入";`);
write("node_modules/tiny-kit/dist/helpers.js", `export default "没有出现在 exports 里";`);

// 在项目根目录放一个模块，从它的位置出发解析（就像项目里的代码导入依赖一样）
write("package.json", JSON.stringify({ type: "module" }));
write("app.js", `export const resolve = (s) => import.meta.resolve(s);`);
const app = (await import(pathToFileURL(join(root, "app.js")).href)) as {
  resolve: (specifier: string) => string;
};
const show = (specifier: string): void => {
  try {
    console.log(specifier, "→", relative(root, fileURLToPath(app.resolve(specifier))));
  } catch (error) {
    console.log(specifier, "→", (error as NodeJS.ErrnoException).code);
  }
};

// ── 1. 条件：同一个入口，按环境选不同的文件 ──────────────────────────
show("tiny-kit"); // node_modules/tiny-kit/dist/index.js（命中 import 条件）
const require = createRequire(join(root, "app.js"));
console.log("require(tiny-kit)", "→", relative(root, require.resolve("tiny-kit"))); // …/dist/index.cjs

// ── 2. 子路径模式与封装 ────────────────────────────────────────────────
show("tiny-kit/tools/search"); // …/dist/tools/search.js
show("tiny-kit/tools/internal-secret"); // ERR_PACKAGE_PATH_NOT_EXPORTED（被 null 排除）
show("tiny-kit/dist/helpers.js"); // ERR_PACKAGE_PATH_NOT_EXPORTED（不在 exports 里，就导入不到）
show("tiny-kit/package.json"); // …/package.json（显式导出了）

// ── 3. imports：包内部的私有别名，以 # 开头 ─────────────────────────────
const kit = (await import(
  pathToFileURL(join(root, "node_modules/tiny-kit/dist/index.js")).href
)) as {
  log: string;
};
console.log("#log（在包内部导入）", "→", kit.log); // node 版本的日志

// ── 4. 自定义条件：node --conditions=tiny-kit/source ───────────────────
const run = (packageName: string, args: string[]): string => {
  const probe = `import("${packageName}").then((m) => console.log(m.flavor))`;
  try {
    return execFileSync(process.execPath, [...args, "--input-type=module", "-e", probe], {
      cwd: root,
      stdio: "pipe",
    })
      .toString()
      .trim();
  } catch (error) {
    return /ERR_[A-Z_]+/.exec(String((error as { stderr: unknown }).stderr))?.[0] ?? "未知错误";
  }
};
console.log("默认条件", "→", run("tiny-kit", [])); // esm
// 条件命中了 src/index.ts，但 Node 拒绝剥离 node_modules 里的 .ts 文件的类型
console.log("--conditions=…/source", "→", run("tiny-kit", ["--conditions=tiny-kit/source"])); // ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING

// 工作区（4.7 节）里的包不一样：node_modules 里只是一个符号链接，真实路径在 packages/ 下
write(
  "packages/linked-kit/package.json",
  JSON.stringify({
    name: "linked-kit",
    type: "module",
    exports: { ".": { "linked-kit/source": "./src/index.ts", default: "./dist/index.js" } },
  }),
);
write("packages/linked-kit/src/index.ts", `export const flavor: string = "source";`);
write("packages/linked-kit/dist/index.js", `export const flavor = "dist";`);
symlinkSync(join(root, "packages/linked-kit"), join(root, "node_modules/linked-kit"), "junction");
console.log("链接的包，默认条件", "→", run("linked-kit", [])); // dist
console.log("链接的包，源码条件", "→", run("linked-kit", ["--conditions=linked-kit/source"])); // source

rmSync(root, { recursive: true, force: true });
