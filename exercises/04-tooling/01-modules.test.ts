import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  isPluginFile,
  loadTools,
  moduleFormat,
  type LoadOutcome,
  type PackageType,
} from "./01-modules.ts";

const run = promisify(execFile);

describe("moduleFormat", () => {
  test.each<[string, PackageType, boolean, LoadOutcome]>([
    ["index.mjs", undefined, false, "esm"],
    ["index.mts", "commonjs", false, "esm"],
    ["index.cjs", "module", false, "cjs"],
    ["index.cts", "module", true, "syntax-error"],
    ["index.js", "module", false, "esm"],
    ["index.ts", "commonjs", false, "cjs"],
    ["index.ts", "commonjs", true, "syntax-error"],
    ["index.js", undefined, false, "cjs"],
    ["index.ts", undefined, true, "esm"],
    ["src/deep/name.with.dots.mjs", "commonjs", true, "esm"],
  ])("%s，type=%s，ESM 语法=%s → %s", (file, type, esmSyntax, expected) => {
    expect(moduleFormat(file, type, esmSyntax)).toBe(expected);
  });

  test("不认识的扩展名抛出错误", () => {
    expect(() => moduleFormat("data.json", "module", false)).toThrow(Error);
    expect(() => moduleFormat("Makefile", undefined, false)).toThrow(Error);
  });

  // 不只和上面的表对答案：在临时目录里造出全部 36 种组合，让真实的 Node 跑一遍
  describe("和真实的 Node.js 对比", () => {
    let root: string;
    beforeAll(() => {
      root = mkdtempSync(join(tmpdir(), "module-format-"));
    });
    afterAll(() => {
      rmSync(root, { recursive: true, force: true });
    });

    test("36 种组合全部一致", { timeout: 30_000 }, async () => {
      const types: PackageType[] = ["module", "commonjs", undefined];
      const extensions = [".js", ".ts", ".mjs", ".mts", ".cjs", ".cts"];
      const cases = types.flatMap((type) =>
        extensions.flatMap((extension) => [false, true].map((esm) => ({ type, extension, esm }))),
      );

      const results = await Promise.all(
        cases.map(async ({ type, extension, esm }, index) => {
          const dir = join(root, String(index));
          mkdirSync(dir);
          if (type !== undefined) {
            writeFileSync(join(dir, "package.json"), JSON.stringify({ type }));
          }
          // ESM 里没有 require；import.meta 是只有 ESM 才有的语法
          const code = `console.log(typeof require === "undefined" ? "esm" : "cjs");${esm ? " import.meta;" : ""}`;
          const file = join(dir, `probe${extension}`);
          writeFileSync(file, code);
          let actual: LoadOutcome;
          try {
            const { stdout } = await run(process.execPath, [file]);
            actual = stdout.trim() === "esm" ? "esm" : "cjs";
          } catch (error) {
            const stderr = (error as { stderr?: string }).stderr ?? "";
            if (!stderr.includes("SyntaxError")) throw error;
            actual = "syntax-error";
          }
          return {
            label: `probe${extension} type=${String(type)} esm=${esm}`,
            actual,
            type,
            extension,
            esm,
          };
        }),
      );

      for (const { label, actual, type, extension, esm } of results) {
        expect(moduleFormat(`probe${extension}`, type, esm), label).toBe(actual);
      }
    });
  });
});

describe("isPluginFile", () => {
  test.each([
    ["search.ts", true],
    ["search.mts", true],
    ["search.js", true],
    ["search.mjs", true],
    ["search.cjs", false],
    ["search.d.ts", false],
    ["search.d.mts", false],
    ["_helpers.ts", false],
    [".hidden.ts", false],
    ["README.md", false],
    ["data.json", false],
  ])("%s → %s", (file, expected) => {
    expect(isPluginFile(file)).toBe(expected);
  });
});

describe("loadTools", () => {
  let dir: string;
  function plugin(name: string, code: string): void {
    writeFileSync(join(dir, name), code);
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "plugins-"));
    plugin(
      "b-upper.mjs",
      `export default { name: "upper", description: "转大写", run: (s) => s.toUpperCase() };`,
    );
    plugin(
      "a-echo.ts",
      `const tool: { name: string; description: string; run: (s: string) => Promise<string> } = {
         name: "echo", description: "原样返回", run: async (s) => s,
       };
       export default tool;`,
    );
    plugin("c-no-default.mjs", `export const name = "lonely";`);
    plugin("d-not-a-tool.mjs", `export default { name: "", description: "名字是空的", run() {} };`);
    plugin("e-broken.mjs", `throw new Error("插件初始化失败");`);
    plugin(
      "f-duplicate.mjs",
      `export default { name: "upper", description: "重名", run: (s) => s };`,
    );
    plugin("_helper.mjs", `throw new Error("辅助文件不该被加载");`);
    plugin("types.d.ts", `export {};`);
    plugin("notes.md", `# 不是插件`);
    mkdirSync(join(dir, "nested.mjs")); // 是目录，不是文件
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("按文件名顺序加载合法的工具", async () => {
    const { tools } = await loadTools(dir);
    expect(tools.map((tool) => tool.name)).toEqual(["echo", "upper"]);
    expect(await tools[0]?.run("hi")).toBe("hi");
    expect(await tools[1]?.run("hi")).toBe("HI");
  });

  test("每个坏插件记一条错误，不影响其他插件", async () => {
    const { errors } = await loadTools(dir);
    expect(errors).toEqual([
      "c-no-default.mjs: 没有默认导出",
      "d-not-a-tool.mjs: 默认导出不是合法的工具",
      "e-broken.mjs: 加载失败：插件初始化失败",
      'f-duplicate.mjs: 工具名 "upper" 已经被 b-upper.mjs 使用',
    ]);
  });

  test("空目录", async () => {
    const empty = mkdtempSync(join(tmpdir(), "plugins-empty-"));
    try {
      expect(await loadTools(empty)).toEqual({ tools: [], errors: [] });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  test("目录不存在时，Promise 被拒绝", async () => {
    await expect(loadTools(join(dir, "missing"))).rejects.toThrow();
  });
});
