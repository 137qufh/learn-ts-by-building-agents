// 4.7 项目结构与 monorepo
// 运行：pnpm tsx chapters/04-tooling/examples/07-monorepo.ts
//
// 在临时目录里手工搭一个和 pnpm 工作区结构相同的小仓库：
// packages/ 下三个包，node_modules 里用符号链接指向它们（pnpm install 做的就是这件事）。

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

const root = mkdtempSync(join(tmpdir(), "monorepo-demo-"));
function write(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
function pkg(name: string, dependencies: Record<string, string> = {}): string {
  return JSON.stringify({
    name,
    type: "module",
    dependencies,
    exports: { ".": { "@demo/source": "./src/index.ts", default: "./dist/index.js" } },
  });
}
/** 模拟 pnpm：把 dependencies 里的工作区包链接到这个包自己的 node_modules 里 */
function link(from: string, to: string): void {
  const target = join(root, from, "node_modules", to);
  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(join(root, "packages", to.split("/")[1] ?? ""), target, "junction");
}

write("pnpm-workspace.yaml", `packages:\n  - "packages/*"\n`);
write("packages/utils/package.json", pkg("@demo/utils"));
write(
  "packages/utils/src/index.ts",
  `export const shout = (s: string): string => s.toUpperCase() + "!";\n`,
);

write("packages/core/package.json", pkg("@demo/core", { "@demo/utils": "workspace:*" }));
write(
  "packages/core/src/index.ts",
  `import { shout } from "@demo/utils";\nexport const greet = (name: string): string => shout("你好，" + name);\n`,
);
link("packages/core", "@demo/utils");

write("packages/app/package.json", pkg("@demo/app", { "@demo/core": "workspace:*" }));
write(
  "packages/app/main.ts",
  `import { greet } from "@demo/core";\nconsole.log(greet("工作区"));\n`,
);
write(
  "packages/app/sneaky.ts",
  `import { shout } from "@demo/utils";\nconsole.log(shout("偷偷用"));\n`,
);
link("packages/app", "@demo/core");

// ── 1. 符号链接：node_modules 里的包，真实位置在 packages/ 下 ────────────
const linked = join(root, "packages/app/node_modules/@demo/core");
console.log(relative(root, linked), "→", relative(root, realpathSync(linked)));
// packages/app/node_modules/@demo/core → packages/core

// ── 2. 用源码条件运行：不需要先构建 ────────────────────────────────────
function run(file: string): string {
  try {
    return execFileSync(process.execPath, ["--conditions=@demo/source", file], {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
  } catch (error) {
    return /ERR_[A-Z_]+/.exec(String((error as { stderr: unknown }).stderr))?.[0] ?? "未知错误";
  }
}
console.log(run("packages/app/main.ts")); // 你好，工作区!

// ── 3. 没有声明的依赖用不了 ──────────────────────────────────────────
// app 没有在 dependencies 里写 @demo/utils，它的 node_modules 里就没有这个链接，
// 哪怕 core 依赖了它。pnpm 的这种严格性杜绝了"幽灵依赖"
console.log(run("packages/app/sneaky.ts")); // ERR_MODULE_NOT_FOUND

rmSync(root, { recursive: true, force: true });
