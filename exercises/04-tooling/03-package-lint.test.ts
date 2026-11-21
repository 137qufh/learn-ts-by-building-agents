import { describe, expect, test } from "vitest";
import { lintPackage, type PackageManifest } from "./03-package-lint.ts";

const good: PackageManifest = {
  name: "@acme/toolkit",
  version: "1.2.0",
  type: "module",
  exports: {
    ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
    "./tools/*": { types: "./dist/tools/*.d.ts", default: "./dist/tools/*.js" },
    "./tools/internal/*": null,
    "./package.json": "./package.json",
  },
};
const goodFiles = [
  "package.json",
  "README.md",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/tools/search.js",
  "dist/tools/search.d.ts",
];

describe("lintPackage", () => {
  test("合格的包没有问题", () => {
    expect(lintPackage(good, goodFiles)).toEqual([]);
  });

  test("name、version、type", () => {
    expect(lintPackage({ ...good, name: "", version: "v1", type: "commonjs" }, goodFiles)).toEqual([
      "缺少 name",
      "version 不是合法的版本号",
      'type 应该是 "module"',
    ]);
    const { name: _name, version: _version, type: _type, ...rest } = good;
    expect(lintPackage(rest, goodFiles)).toEqual([
      "缺少 name",
      "version 不是合法的版本号",
      'type 应该是 "module"',
    ]);
    expect(lintPackage({ ...good, version: "0.3.1-beta.1" }, goodFiles)).toEqual([]);
  });

  test("缺少 exports", () => {
    const { exports: _exports, ...rest } = good;
    expect(lintPackage(rest, goodFiles)).toEqual(["缺少 exports"]);
  });

  test("条件的顺序，包括嵌套的条件对象", () => {
    const manifest: PackageManifest = {
      ...good,
      exports: {
        ".": {
          default: "./dist/index.js",
          types: "./dist/index.d.ts",
        },
        "./node": {
          node: { import: "./dist/index.js", types: "./dist/index.d.ts" },
          default: "./dist/index.js",
        },
      },
    };
    expect(lintPackage(manifest, goodFiles)).toEqual([
      ".: types 条件必须写在 import/require/node/default 之前",
      ".: default 条件必须写在最后",
      "./node: types 条件必须写在 import/require/node/default 之前",
    ]);
  });

  test("自定义条件可以写在 types 前面", () => {
    const manifest: PackageManifest = {
      ...good,
      exports: {
        ".": {
          "@acme/source": "./src/index.ts",
          types: "./dist/index.d.ts",
          default: "./dist/index.js",
        },
      },
    };
    expect(lintPackage(manifest, [...goodFiles, "src/index.ts"])).toEqual([]);
  });

  test("目标文件不会被发布（包括模式）", () => {
    expect(lintPackage(good, ["package.json", "dist/index.js", "dist/index.d.ts"])).toEqual([
      "./tools/*: ./dist/tools/*.d.ts 不会被发布",
      "./tools/*: ./dist/tools/*.js 不会被发布",
    ]);
  });

  test("模式里的 * 不能匹配空字符串", () => {
    const manifest: PackageManifest = { ...good, exports: { "./*": "./dist/*.js" } };
    expect(lintPackage(manifest, ["dist/.js"])).toEqual(["./*: ./dist/*.js 不会被发布"]);
    expect(lintPackage(manifest, ["dist/a.js", "dist/a.d.ts"])).toEqual([]);
  });

  test("模式里的 . 是普通字符，不是正则表达式的通配符", () => {
    const manifest: PackageManifest = { ...good, exports: { "./*": "./dist/*.js" } };
    expect(lintPackage(manifest, ["dist/axjs"])).toEqual(["./*: ./dist/*.js 不会被发布"]);
  });

  test("exports 是字符串或条件对象时，当作子路径 '.'", () => {
    expect(lintPackage({ ...good, exports: "./main.js" }, ["main.js", "main.d.ts"])).toEqual([]);
    expect(lintPackage({ ...good, exports: "./main.js" }, ["main.d.ts"])).toEqual([
      ".: ./main.js 不会被发布",
    ]);
    expect(
      lintPackage({ ...good, exports: { import: "./main.js", types: "./main.d.ts" } }, [
        "main.js",
        "main.d.ts",
      ]),
    ).toEqual([".: types 条件必须写在 import/require/node/default 之前"]);
  });

  test("没有类型声明：既没有 types 目标，旁边也没有同名的 .d.ts", () => {
    const manifest: PackageManifest = {
      ...good,
      exports: {
        ".": "./dist/index.js",
        "./cli": { import: "./dist/cli.js", require: "./dist/cli.cjs" },
      },
    };
    expect(lintPackage(manifest, ["dist/index.js", "dist/cli.js", "dist/cli.cjs"])).toEqual([
      ".: 没有类型声明",
      "./cli: 没有类型声明",
    ]);
    // 旁边有同名的 .d.ts，TypeScript 能找到
    expect(
      lintPackage(manifest, [
        "dist/index.js",
        "dist/index.d.ts",
        "dist/cli.js",
        "dist/cli.cjs",
        "dist/cli.d.ts",
      ]),
    ).toEqual([]);
  });

  test("null 目标不需要检查", () => {
    const manifest: PackageManifest = {
      ...good,
      exports: { ".": "./index.js", "./internal": null },
    };
    expect(lintPackage(manifest, ["index.js", "index.d.ts"])).toEqual([]);
  });

  test("测试文件被打包了", () => {
    expect(
      lintPackage(good, [...goodFiles, "dist/index.test.js", "src/a.test.ts", "dist/latest.json"]),
    ).toEqual(["测试文件被打包了：dist/index.test.js", "测试文件被打包了：src/a.test.ts"]);
  });

  test("多种问题同时出现时，按规定的顺序报告", () => {
    const manifest: PackageManifest = {
      name: "x",
      version: "1.0.0",
      type: "module",
      exports: {
        ".": { import: "./dist/index.js", types: "./dist/index.d.ts" },
        "./extra": "./dist/extra.js",
      },
    };
    expect(lintPackage(manifest, ["dist/index.js", "dist/extra.test.js"])).toEqual([
      ".: types 条件必须写在 import/require/node/default 之前",
      ".: ./dist/index.d.ts 不会被发布",
      "./extra: ./dist/extra.js 不会被发布",
      "./extra: 没有类型声明",
      "测试文件被打包了：dist/extra.test.js",
    ]);
  });
});
