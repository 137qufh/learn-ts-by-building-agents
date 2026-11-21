/**
 * 仓库自检：类型测试（exercises/**\/*.test-d.ts）对参考答案必须全部通过。
 *
 * 运行时测试可以靠 vitest.config.ts 里的插件把导入改到 solutions/，类型测试却是交给 tsc 检查的，
 * 插件管不到。所以这里换个办法：搭一个临时目录，把参考答案放到"练习文件"本该在的位置，
 * 再把测试文件复制进去，然后对整个目录运行一次 tsc。
 *
 * 顺便把运行时测试（*.test.ts）也复制进去，保证它们对参考答案同样能通过类型检查。
 * 有些测试会导入 chapters/ 下的辅助代码（比如第 3 章项目的假服务器），所以 chapters/ 的 .ts 文件也一并复制。
 */
import { spawnSync } from "node:child_process";
import { cpSync, globSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterAll, expect, test } from "vitest";

const TEMP_DIR = ".solutions-typecheck";
const require = createRequire(import.meta.url);

const typeTests = globSync("exercises/**/*.test-d.ts").map((file) => file.replaceAll("\\", "/"));

afterAll(() => {
  rmSync(TEMP_DIR, { recursive: true, force: true });
});

test.skipIf(typeTests.length === 0)(
  "类型测试和运行时测试对参考答案都能通过 tsc",
  () => {
    rmSync(TEMP_DIR, { recursive: true, force: true });
    mkdirSync(TEMP_DIR);

    // 参考答案放到练习文件的位置：solutions/02-x/a.ts → .solutions-typecheck/exercises/02-x/a.ts
    cpSync("solutions", join(TEMP_DIR, "exercises"), { recursive: true });
    cpSync("exercises/todo.ts", join(TEMP_DIR, "exercises/todo.ts"));
    const testFiles = globSync("exercises/**/*.{test,test-d}.ts").map((f) =>
      f.replaceAll("\\", "/"),
    );
    const chapterFiles = globSync("chapters/**/*.ts").map((f) => f.replaceAll("\\", "/"));
    for (const file of [...testFiles, ...chapterFiles]) {
      mkdirSync(dirname(join(TEMP_DIR, file)), { recursive: true });
      cpSync(file, join(TEMP_DIR, file));
    }

    writeFileSync(
      join(TEMP_DIR, "tsconfig.json"),
      // exclude 必须显式清空，否则会继承根配置里的 exclude（其中就有这个临时目录本身）
      JSON.stringify({ extends: "../tsconfig.json", include: ["**/*.ts"], exclude: [] }),
    );

    const tsc = join(dirname(require.resolve("typescript7/package.json")), "bin/tsc");
    const result = spawnSync(process.execPath, [tsc, "-p", TEMP_DIR, "--pretty", "false"], {
      encoding: "utf8",
    });
    expect(result.stdout + result.stderr).toBe("");
    expect(result.status).toBe(0);
  },
  60_000,
);
