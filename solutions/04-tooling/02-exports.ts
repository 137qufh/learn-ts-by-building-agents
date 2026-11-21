/**
 * 练习 4-2：exports 解析
 *
 * 课程：chapters/04-tooling/02-resolution.md
 * 运行：pnpm ex 02-exports
 */

/** package.json 里 exports 字段的一个"目标" */
export type ExportTarget = string | null | ConditionalTarget;
/** 条件对象：键是条件名，按书写顺序匹配 */
export interface ConditionalTarget {
  [condition: string]: ExportTarget;
}
/** exports 字段：可以直接是一个目标（相当于只导出 "."），也可以是"子路径 → 目标"的对象 */
export type ExportsField = string | null | { [key: string]: ExportTarget };

export type ResolveErrorCode = "ERR_PACKAGE_PATH_NOT_EXPORTED" | "ERR_INVALID_PACKAGE_TARGET";

export class PackageResolveError extends Error {
  override name = "PackageResolveError";
  readonly code: ResolveErrorCode;
  constructor(code: ResolveErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

// ── 第一部分：实现 Node.js 的 exports 解析算法（一个子集） ───────────────

/**
 * 判断一个 exports 对象是不是"子路径对象"：所有键都以 "." 开头。
 * 否则它就是条件对象（相当于 { ".": 它 }）。键里两种混用时抛出 ERR_INVALID_PACKAGE_TARGET。
 */
function isSubpathMap(exports: { [key: string]: ExportTarget }): boolean {
  const keys = Object.keys(exports);
  const dotted = keys.filter((key) => key.startsWith("."));
  if (dotted.length > 0 && dotted.length !== keys.length) {
    throw new PackageResolveError(
      "ERR_INVALID_PACKAGE_TARGET",
      "exports 的键不能混用子路径（以 . 开头）和条件名",
    );
  }
  return dotted.length > 0;
}

/**
 * 解析一个目标：
 * - 字符串：必须以 "./" 开头，否则抛 ERR_INVALID_PACKAGE_TARGET；把里面每个 "*" 换成 match
 * - null：返回 null（明确排除）
 * - 条件对象：按键的书写顺序，第一个在 conditions 里（或者键是 "default"）的条件，
 *   递归解析它的值；结果是 undefined（里面没有匹配的条件）就继续看下一个键
 * - 都不匹配：返回 undefined
 */
function resolveTarget(
  target: ExportTarget,
  match: string,
  conditions: ReadonlySet<string>,
): string | null | undefined {
  if (target === null) {
    return null;
  }
  if (typeof target === "string") {
    if (!target.startsWith("./")) {
      throw new PackageResolveError(
        "ERR_INVALID_PACKAGE_TARGET",
        `目标 "${target}" 必须以 "./" 开头`,
      );
    }
    return target.replaceAll("*", match);
  }
  for (const [condition, value] of Object.entries(target)) {
    if (condition === "default" || conditions.has(condition)) {
      const resolved = resolveTarget(value, match, conditions);
      if (resolved !== undefined) {
        return resolved;
      }
    }
  }
  return undefined;
}

/**
 * 按 Node.js 的规则，解析 `import "包名" + subpath.slice(1)` 对应包里的哪个文件。
 *
 * @param exports package.json 的 exports 字段
 * @param subpath "." 表示包本身，"./tools/search" 表示 `包名/tools/search`
 * @param conditions 当前生效的条件，比如 ["node", "import"]。"default" 总是生效，不用写在这里
 * @returns 相对于包根目录的路径，比如 "./dist/index.js"
 * @throws PackageResolveError
 *   - ERR_PACKAGE_PATH_NOT_EXPORTED：子路径没有导出、被 null 排除，或者没有匹配的条件
 *   - ERR_INVALID_PACKAGE_TARGET：目标不以 "./" 开头，或者 exports 的键混用了子路径和条件名
 *
 * 匹配子路径的规则：
 * 1. 先找完全相同的键（不含 "*" 的键）
 * 2. 再找模式键（含一个 "*"）：subpath 以 "*" 前面的部分开头、以后面的部分结尾，
 *    并且比两部分加起来更长（"*" 至少匹配一个字符）。"*" 匹配到的内容可以包含 "/"
 * 3. 多个模式键都匹配时，"*" 前面部分最长的那个优先（最具体的优先）；一样长时，整个键更长的优先
 *
 * 解析目标（键对应的值）的规则：
 * - 字符串：必须以 "./" 开头，否则抛 ERR_INVALID_PACKAGE_TARGET；把里面每个 "*" 换成模式匹配到的内容
 * - null：明确排除，等于没有导出
 * - 条件对象：按键的书写顺序，找第一个在 conditions 里（或者键是 "default"）的条件，递归解析它的值；
 *   如果里面没有任何匹配的条件，回到这一层继续看下一个键
 *
 * exports 本身是对象时，键要么全以 "." 开头（子路径对象），要么全不以 "." 开头（条件对象，
 * 相当于 { ".": 它 }）；混用时抛 ERR_INVALID_PACKAGE_TARGET。
 *
 * 不需要支持：数组形式的目标、目标里的 "../" 检查、imports 字段。
 */
export function resolveExports(
  exports: ExportsField,
  subpath: string,
  conditions: Iterable<string>,
): string {
  const active = new Set(conditions);
  const map: { [key: string]: ExportTarget } =
    typeof exports === "string" || exports === null || !isSubpathMap(exports)
      ? { ".": exports }
      : exports;

  const notExported = (): PackageResolveError =>
    new PackageResolveError("ERR_PACKAGE_PATH_NOT_EXPORTED", `子路径 "${subpath}" 没有被导出`);

  let target: ExportTarget | undefined;
  let match = "";
  if (!subpath.includes("*") && Object.hasOwn(map, subpath)) {
    target = map[subpath];
  } else {
    let bestKey: string | undefined;
    for (const key of Object.keys(map)) {
      const star = key.indexOf("*");
      if (star === -1 || key.indexOf("*", star + 1) !== -1) {
        continue;
      }
      const prefix = key.slice(0, star);
      const suffix = key.slice(star + 1);
      if (
        subpath.length > prefix.length + suffix.length &&
        subpath.startsWith(prefix) &&
        subpath.endsWith(suffix) &&
        (bestKey === undefined || compareKeys(key, bestKey) < 0)
      ) {
        bestKey = key;
        match = subpath.slice(prefix.length, subpath.length - suffix.length);
      }
    }
    if (bestKey !== undefined) {
      target = map[bestKey];
    }
  }
  if (target === undefined) {
    throw notExported();
  }
  const resolved = resolveTarget(target, match, active);
  if (resolved === null || resolved === undefined) {
    throw notExported();
  }
  return resolved;
}

/** 负数表示 a 比 b 更具体 */
function compareKeys(a: string, b: string): number {
  const prefixA = a.indexOf("*");
  const prefixB = b.indexOf("*");
  if (prefixA !== prefixB) {
    return prefixB - prefixA;
  }
  return b.length - a.length;
}

// ── 第二部分：给一个包写 exports ──────────────────────────────────────

/**
 * 包 @acme/toolkit 的目录结构是这样的：
 *
 *   src/index.ts             源码入口
 *   dist/index.js            编译产物
 *   dist/index.d.ts          类型声明
 *   dist/tools/<名字>.js      每个工具一个文件，比如 dist/tools/search.js
 *   dist/tools/<名字>.d.ts
 *   dist/tools/internal/...  内部工具，不对外
 *   package.json
 *
 * 写出它的 exports，要求：
 * - `import "@acme/toolkit"` 得到 dist/index.js；TypeScript 找到 dist/index.d.ts
 * - 开启自定义条件 "@acme/source" 时（开发时用），`import "@acme/toolkit"` 直接得到 src/index.ts
 * - `import "@acme/toolkit/tools/search"` 得到 dist/tools/search.js，类型是 dist/tools/search.d.ts；
 *   其他工具同理
 * - `@acme/toolkit/tools/internal/...` 一律导入不到
 * - `@acme/toolkit/package.json` 可以导入（有些工具需要读它）
 * - 其他任何子路径（比如 `@acme/toolkit/dist/index.js`）都导入不到
 *
 * 提示：TypeScript 解析类型时会启用 "types" 条件；条件按书写顺序匹配。
 */
export const toolkitExports: ExportsField = {
  ".": {
    "@acme/source": "./src/index.ts",
    types: "./dist/index.d.ts",
    default: "./dist/index.js",
  },
  "./tools/*": {
    types: "./dist/tools/*.d.ts",
    default: "./dist/tools/*.js",
  },
  "./tools/internal/*": null,
  "./package.json": "./package.json",
};
