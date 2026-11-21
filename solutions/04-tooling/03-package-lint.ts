/**
 * 练习 4-3：检查一个包能不能发布
 *
 * 课程：chapters/04-tooling/03-publishing.md
 * 运行：pnpm ex 03-package-lint
 *
 * 发布之前最容易犯的错，大多数都能从 package.json 和"会被打包的文件列表"里看出来。
 * 这道题写一个小小的检查器，思路和 publint、Are the Types Wrong? 这类工具一样。
 */
import type { ExportTarget, ExportsField } from "./02-exports.ts";

export interface PackageManifest {
  name?: string;
  version?: string;
  type?: string;
  exports?: ExportsField;
}

/**
 * 检查 manifest（package.json 的内容）和 files（npm pack 会打包的文件，相对于包根目录，
 * 比如 "dist/index.js"，不带 "./"），返回发现的问题，没有问题时返回空数组。
 *
 * 按下面的顺序检查，每条问题的文字必须和这里写的完全一致：
 *
 * 1. 没有 name，或者 name 是空字符串：`缺少 name`
 * 2. version 不是 "数字.数字.数字" 开头（比如 "1.0.0"、"0.3.1-beta.1"）：`version 不是合法的版本号`
 * 3. type 不是 "module"：`type 应该是 "module"`
 * 4. 没有 exports：`缺少 exports`，并且跳过第 5 条
 * 5. 对 exports 里的每个子路径（exports 是字符串或条件对象时，当作子路径 "."），按键的顺序：
 *    a. 检查这个子路径的条件对象，以及嵌套在里面的所有条件对象：
 *       - 有 "types" 但它不是第一个键：`${子路径}: types 条件必须写在最前面`
 *       - 有 "default" 但它不是最后一个键：`${子路径}: default 条件必须写在最后`
 *    b. 收集这个子路径下所有的字符串目标（包括嵌套条件里的），按出现顺序检查每一个：
 *       - 不含 "*"：去掉开头的 "./" 后不在 files 里 → `${子路径}: ${目标} 不会被发布`
 *       - 含 "*"：files 里没有任何文件能匹配（"*" 匹配任意非空字符串）→ 同上
 *    c. 这个子路径的目标里有以 ".js" 结尾的（不含 "*"），但一个以 ".d.ts" 结尾的目标都没有，
 *       并且 files 里也没有和那个 .js 同名的 .d.ts：`${子路径}: 没有类型声明`
 *       （只报一次，看第一个 .js 目标）
 * 6. files 里每个文件名含有 ".test." 的文件：`测试文件被打包了：${文件}`
 */
export function lintPackage(manifest: PackageManifest, files: readonly string[]): string[] {
  const problems: string[] = [];
  const packed = new Set(files);

  if (manifest.name === undefined || manifest.name === "") {
    problems.push("缺少 name");
  }
  if (manifest.version === undefined || !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    problems.push("version 不是合法的版本号");
  }
  if (manifest.type !== "module") {
    problems.push('type 应该是 "module"');
  }

  if (manifest.exports === undefined) {
    problems.push("缺少 exports");
  } else {
    for (const [subpath, target] of subpathEntries(manifest.exports)) {
      problems.push(...checkConditionOrder(subpath, target));

      const targets = collectTargets(target);
      for (const file of targets) {
        if (!isPacked(file, files, packed)) {
          problems.push(`${subpath}: ${file} 不会被发布`);
        }
      }

      const firstJs = targets.find((file) => file.endsWith(".js") && !file.includes("*"));
      const hasTypes = targets.some((file) => file.endsWith(".d.ts"));
      if (firstJs !== undefined && !hasTypes) {
        const sibling = stripDot(firstJs).replace(/\.js$/, ".d.ts");
        if (!packed.has(sibling)) {
          problems.push(`${subpath}: 没有类型声明`);
        }
      }
    }
  }

  for (const file of files) {
    if (file.split("/").at(-1)?.includes(".test.")) {
      problems.push(`测试文件被打包了：${file}`);
    }
  }
  return problems;
}

function subpathEntries(exports: ExportsField): [string, ExportTarget][] {
  if (typeof exports === "string" || exports === null) {
    return [[".", exports]];
  }
  const keys = Object.keys(exports);
  if (keys.length > 0 && keys.every((key) => key.startsWith("."))) {
    return Object.entries(exports);
  }
  return [[".", exports]];
}

function checkConditionOrder(subpath: string, target: ExportTarget): string[] {
  if (typeof target !== "object" || target === null) {
    return [];
  }
  const problems: string[] = [];
  const keys = Object.keys(target);
  const typesIndex = keys.indexOf("types");
  if (typesIndex > 0) {
    problems.push(`${subpath}: types 条件必须写在最前面`);
  }
  const defaultIndex = keys.indexOf("default");
  if (defaultIndex !== -1 && defaultIndex !== keys.length - 1) {
    problems.push(`${subpath}: default 条件必须写在最后`);
  }
  for (const value of Object.values(target)) {
    problems.push(...checkConditionOrder(subpath, value));
  }
  return problems;
}

function collectTargets(target: ExportTarget): string[] {
  if (target === null) {
    return [];
  }
  if (typeof target === "string") {
    return [target];
  }
  return Object.values(target).flatMap(collectTargets);
}

function stripDot(target: string): string {
  return target.startsWith("./") ? target.slice(2) : target;
}

function isPacked(target: string, files: readonly string[], packed: ReadonlySet<string>): boolean {
  const path = stripDot(target);
  if (!path.includes("*")) {
    return packed.has(path);
  }
  // 把目标变成正则表达式：特殊字符转义，每个 * 换成 .+
  const escaped = path.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`^${escaped.join(".+")}$`);
  return files.some((file) => pattern.test(file));
}
