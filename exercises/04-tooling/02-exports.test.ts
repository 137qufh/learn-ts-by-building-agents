import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  PackageResolveError,
  resolveExports,
  toolkitExports,
  type ExportsField,
} from "./02-exports.ts";

const run = promisify(execFile);

/** 调用 resolveExports，把结果或错误码统一成字符串，方便比较 */
function attempt(exports: ExportsField, subpath: string, conditions: string[]): string {
  try {
    return resolveExports(exports, subpath, conditions);
  } catch (error) {
    if (error instanceof PackageResolveError) return error.code;
    throw error;
  }
}

const NODE_IMPORT = ["node", "import"];

describe("resolveExports", () => {
  test("exports 是字符串：只导出包本身", () => {
    expect(attempt("./index.js", ".", NODE_IMPORT)).toBe("./index.js");
    expect(attempt("./index.js", "./other", NODE_IMPORT)).toBe("ERR_PACKAGE_PATH_NOT_EXPORTED");
  });

  test("exports 是条件对象：相当于 { '.': 条件对象 }", () => {
    const exports = { import: "./esm.js", require: "./cjs.cjs" };
    expect(attempt(exports, ".", ["node", "import"])).toBe("./esm.js");
    expect(attempt(exports, ".", ["node", "require"])).toBe("./cjs.cjs");
    expect(attempt(exports, ".", ["browser"])).toBe("ERR_PACKAGE_PATH_NOT_EXPORTED");
  });

  test("条件按书写顺序匹配，而不是按 conditions 参数的顺序", () => {
    const exports = { ".": { node: "./node.js", import: "./import.js", default: "./default.js" } };
    expect(attempt(exports, ".", ["import", "node"])).toBe("./node.js");
    expect(attempt(exports, ".", ["import"])).toBe("./import.js");
    expect(attempt(exports, ".", [])).toBe("./default.js");
  });

  test("嵌套的条件：里面没有匹配时，回到外层继续找下一个键", () => {
    const exports = {
      ".": {
        node: { require: "./node.cjs" },
        default: "./fallback.js",
      },
    };
    expect(attempt(exports, ".", ["node", "require"])).toBe("./node.cjs");
    expect(attempt(exports, ".", ["node", "import"])).toBe("./fallback.js");
  });

  test("子路径模式：* 可以匹配包含 / 的内容，目标里的每个 * 都被替换", () => {
    const exports = { "./tools/*": "./dist/tools/*.js", "./data/*.json": "./data/*/*.json" };
    expect(attempt(exports, "./tools/search", NODE_IMPORT)).toBe("./dist/tools/search.js");
    expect(attempt(exports, "./tools/web/fetch", NODE_IMPORT)).toBe("./dist/tools/web/fetch.js");
    expect(attempt(exports, "./data/en.json", NODE_IMPORT)).toBe("./data/en/en.json");
    expect(attempt(exports, "./tools/", NODE_IMPORT)).toBe("ERR_PACKAGE_PATH_NOT_EXPORTED");
  });

  test("最具体的模式优先，null 表示排除", () => {
    const exports = {
      "./*": "./dist/*.js",
      "./tools/*": "./dist/tools/*.js",
      "./tools/internal/*": null,
    };
    expect(attempt(exports, "./tools/search", NODE_IMPORT)).toBe("./dist/tools/search.js");
    expect(attempt(exports, "./tools/internal/x", NODE_IMPORT)).toBe(
      "ERR_PACKAGE_PATH_NOT_EXPORTED",
    );
    expect(attempt(exports, "./utils", NODE_IMPORT)).toBe("./dist/utils.js");
  });

  test("完全相同的键优先于模式", () => {
    const exports = { "./tools/*": "./dist/tools/*.js", "./tools/index": "./dist/tools.js" };
    expect(attempt(exports, "./tools/index", NODE_IMPORT)).toBe("./dist/tools.js");
  });

  test("非法的目标和非法的 exports", () => {
    expect(attempt({ ".": "dist/index.js" }, ".", NODE_IMPORT)).toBe("ERR_INVALID_PACKAGE_TARGET");
    expect(attempt({ ".": "./index.js", import: "./x.js" }, ".", NODE_IMPORT)).toBe(
      "ERR_INVALID_PACKAGE_TARGET",
    );
  });

  test("错误是 PackageResolveError，并且带有说明", () => {
    expect(() => resolveExports({ ".": "./index.js" }, "./nope", NODE_IMPORT)).toThrow(
      PackageResolveError,
    );
  });
});

// ── 和真实的 Node.js 对比 ───────────────────────────────────────────────
// 在临时目录里把 exports 写进一个真的包，再用 import.meta.resolve 让 Node 自己解析。

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "exports-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module" }));
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

let packageCount = 0;
/** 返回 Node 对每个子路径的解析结果："./xxx" 或者错误码 */
async function nodeResolve(
  exports: ExportsField,
  subpaths: string[],
  customConditions: string[],
): Promise<string[]> {
  const name = `pkg-${packageCount++}`;
  const packageDir = join(root, "node_modules", name);
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(
    join(packageDir, "package.json"),
    JSON.stringify({ name, type: "module", exports }),
  );
  const specifiers = subpaths.map((subpath) => name + subpath.slice(1));
  const script = `
    const out = [];
    for (const s of ${JSON.stringify(specifiers)}) {
      try { out.push(import.meta.resolve(s)); } catch (e) { out.push(e.code); }
    }
    console.log(JSON.stringify(out));`;
  const args = [
    ...customConditions.map((c) => `--conditions=${c}`),
    "--input-type=module",
    "-e",
    script,
  ];
  const { stdout } = await run(process.execPath, args, { cwd: root });
  const results = JSON.parse(stdout) as string[];
  return results.map((result) =>
    result.startsWith("file:")
      ? "./" +
        fileURLToPath(result)
          .slice(packageDir.length + 1)
          .replaceAll("\\", "/")
      : result,
  );
}

// Node 解析 import 时默认启用的条件
const NODE_DEFAULTS = ["node", "import", "module-sync", "node-addons"];

describe("和真实的 Node.js 对比", { timeout: 30_000 }, () => {
  const cases: { exports: ExportsField; subpaths: string[]; conditions: string[] }[] = [
    {
      exports: {
        ".": { types: "./index.d.ts", require: "./index.cjs", import: "./index.js" },
        "./*": "./lib/*.js",
        "./lib/*": null,
        "./tools/*/index": { node: "./tools/*/node.js", default: "./tools/*/web.js" },
      },
      subpaths: [".", "./a", "./a/b", "./lib/x", "./tools/fs/index", "./tools/index", "./"],
      conditions: [],
    },
    {
      exports: {
        ".": { custom: { import: "./custom.js" }, default: "./default.js" },
        "./feature": { custom: null, default: "./feature.js" },
      },
      subpaths: [".", "./feature", "./missing"],
      conditions: ["custom"],
    },
    {
      exports: { "./a/*": "./1/*.js", "./a/b/*": "./2/*.js", "./a/*/c": "./3/*.js" },
      subpaths: ["./a/x", "./a/b/x", "./a/b/c", "./a/q/c", "./a/"],
      conditions: [],
    },
  ];

  test.each(cases)("$subpaths", async ({ exports, subpaths, conditions }) => {
    const expected = await nodeResolve(exports, subpaths, conditions);
    const actual = subpaths.map((subpath) =>
      attempt(exports, subpath, [...NODE_DEFAULTS, ...conditions]),
    );
    expect(actual).toEqual(expected);
  });
});

describe("toolkitExports", { timeout: 30_000 }, () => {
  const subpaths = [
    ".",
    "./tools/search",
    "./tools/web/fetch",
    "./tools/internal/secret",
    "./package.json",
    "./dist/index.js",
    "./src/index.ts",
  ];

  test("运行时（Node 默认条件）", async () => {
    expect(await nodeResolve(toolkitExports, subpaths, [])).toEqual([
      "./dist/index.js",
      "./dist/tools/search.js",
      "./dist/tools/web/fetch.js",
      "ERR_PACKAGE_PATH_NOT_EXPORTED",
      "./package.json",
      "ERR_PACKAGE_PATH_NOT_EXPORTED",
      "ERR_PACKAGE_PATH_NOT_EXPORTED",
    ]);
  });

  test("TypeScript 查找类型（types 条件）", async () => {
    const [main, search] = await nodeResolve(toolkitExports, subpaths.slice(0, 2), ["types"]);
    expect([main, search]).toEqual(["./dist/index.d.ts", "./dist/tools/search.d.ts"]);
  });

  test("开发时（@acme/source 条件），连同 types 条件一起开启也是源码优先", async () => {
    expect(await nodeResolve(toolkitExports, ["."], ["@acme/source"])).toEqual(["./src/index.ts"]);
    expect(await nodeResolve(toolkitExports, ["."], ["types", "@acme/source"])).toEqual([
      "./src/index.ts",
    ]);
  });
});
