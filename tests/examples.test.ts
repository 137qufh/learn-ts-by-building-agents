/**
 * 仓库自检：每个 chapters/<章>/examples/*.ts 都必须能直接用 `node 文件名.ts` 跑通。
 *
 * 这里故意用 Node.js 原生的类型剥离（type stripping）而不是 tsx 来运行，
 * 这样就能顺便保证示例代码只用了“可擦除”的 TypeScript 语法（见第 0 章）。
 */
import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import { describe, expect, test } from "vitest";

const examples = globSync("chapters/*/examples/*.ts").sort();

describe("示例都能运行", () => {
  test("至少有一个示例", () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  test.each(examples)("node %s", (file) => {
    const result = spawnSync(process.execPath, [file], {
      encoding: "utf8",
      input: "", // 关闭 stdin，交互式示例会直接结束
      timeout: 10_000,
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
