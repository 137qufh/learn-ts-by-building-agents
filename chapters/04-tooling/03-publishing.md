# 4.3 打包一个库

> 这一节要解决的问题：本仓库的代码一直是"写 `.ts`，直接运行"。可是要把代码做成一个包给别人用，就不能这样了：Node 不会剥离 `node_modules` 里的类型（4.2 节），用户的 TypeScript 也需要知道你的包有哪些类型。一个合格的 TypeScript 库应该包含哪些文件？`package.json` 该怎么写？发布之前怎么检查？

示例代码：[examples/03-publishing.ts](examples/03-publishing.ts)

## 一个库要交付什么

用户安装你的包之后，需要两样东西：

- **JavaScript**：运行时真正执行的代码，`.js` 文件
- **类型声明**：`.d.ts` 文件，只有类型、没有实现，让用户的编辑器和 `tsc` 知道每个导出是什么类型

两者都由 `tsc` 从源码生成。另外通常还有两种辅助文件：

- **source map**（`.js.map`）：记录 `.js` 的每一行对应源码的哪一行。出错时堆栈可以指向 `.ts` 源码（4.8 节）
- **declaration map**（`.d.ts.map`）：记录 `.d.ts` 里的每个声明对应源码的哪个位置。用户在编辑器里"跳转到定义"时，可以直接跳到你的 `.ts` 源码，而不是 `.d.ts`。这需要把 `src/` 也一起发布

## 用 tsc 编译

本仓库的 `tsconfig.json` 写了 `noEmit: true`：只检查、不输出。库要输出，所以通常给它单独一份配置。示例代码用的是这样一份：

```json
{
  "compilerOptions": {
    "target": "es2025",
    "module": "nodenext",
    "strict": true,

    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "rewriteRelativeImportExtensions": true,
    "isolatedDeclarations": true,

    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "types": []
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

新出现的选项：

| 选项                              | 作用                                                          |
| --------------------------------- | ------------------------------------------------------------- |
| `rootDir` / `outDir`              | `src/a/b.ts` 输出到 `dist/a/b.js`：目录结构保持不变           |
| `declaration`                     | 同时输出 `.d.ts`                                              |
| `declarationMap` / `sourceMap`    | 输出上面说的两种 map 文件                                     |
| `rewriteRelativeImportExtensions` | 把源码里的 `import "./greet.ts"` 改写成 `import "./greet.js"` |
| `isolatedDeclarations`            | 要求导出的东西都写明类型，下面细说                            |
| `exclude`                         | 测试文件不编译、不发布                                        |

`rewriteRelativeImportExtensions` 解决的是 4.1 节留下的问题：源码里写 `.ts` 扩展名，是因为 Node 直接运行的就是 `.ts` 文件；编译之后磁盘上只有 `.js`，导入路径也得跟着变。它只改写 **相对路径**，不会动 `"zod"` 这样的包名。有了它就不再需要 `allowImportingTsExtensions`（那个选项只允许在 `noEmit` 时使用）。

运行示例，看看 `dist/` 里的东西：

```text
── dist/index.js：.ts 扩展名被改写成了 .js ──
export { greet } from "./greet.js";

── dist/greet.d.ts：只剩类型，没有实现 ──
export interface GreetOptions {
    /** 称呼前面加的词，默认"你好" */
    greeting?: string;
}
export declare function greet(name: string, options?: GreetOptions): string;
```

`.d.ts` 里只有签名，`declare` 的意思是"这个东西在运行时存在，这里只描述它的类型"（4.4 节细讲）。注释也被保留了，用户在编辑器里悬停时能看到。

有一个细节：`dist/index.d.ts` 里写的是 `export { greet } from "./greet.ts"`，扩展名没有被改写。这没有问题：TypeScript 在声明文件里看到 `./greet.ts`，会去找同目录的 `greet.d.ts`。

### `isolatedDeclarations`

默认情况下，`tsc` 生成 `.d.ts` 需要推断类型：你没写返回类型的函数，它得分析函数体才知道返回什么，可能还要去别的文件里查。`isolatedDeclarations` 要求 **每个导出都写明类型**，这样只看一个文件的语法就能生成它的 `.d.ts`：

```ts
export function double(n: number) {
  return n * 2; // error TS9013: Expression type can't be inferred with --isolatedDeclarations.
}
export const tools = ["a", "b"].map((x) => x.toUpperCase());
// error TS9010: Variable must have an explicit type annotation with --isolatedDeclarations.
```

修正方法就是写上类型：`function double(n: number): number`。字面量这种一眼能看出类型的不用写（`export const name = "x"` 没问题）。

好处有两个。一是快：别的工具（比如 esbuild、oxc）不用做类型检查，就能并行地为每个文件生成 `.d.ts`。二是 **让公开接口成为有意识的决定**：一个导出函数的返回类型是你对用户的承诺，不应该因为改了函数体就悄悄变了。[1.4 节](../01-basics/04-functions.md)说过"导出的函数建议显式写出返回类型"，这个选项把它变成了强制规则。

## `package.json` 的字段

```json
{
  "name": "@acme/toolkit",
  "version": "1.2.0",
  "description": "……",
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./package.json": "./package.json"
  },
  "files": ["dist", "src", "!src/**/*.test.ts"],
  "engines": { "node": ">=22.12" },
  "sideEffects": false,
  "scripts": { "build": "tsc -p tsconfig.build.json", "prepack": "pnpm build" },
  "dependencies": {},
  "peerDependencies": {}
}
```

| 字段               | 说明                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------- |
| `name`             | 包名。`@acme/` 是作用域（scope），属于某个用户或组织，不会和别人撞名                   |
| `version`          | 语义化版本，见下文                                                                     |
| `type` / `exports` | 4.1、4.2 节。`types` 条件写最前                                                        |
| `files`            | **白名单**：只有这里列出的文件会被打包（`package.json`、`README`、`LICENSE` 总是包含） |
| `engines`          | 支持的 Node 版本。纯 ESM 包写 `>=22.12`（能被 `require` 的最低版本，4.1 节）           |
| `sideEffects`      | 告诉打包工具"导入这个包不会产生副作用"，没用到的模块可以放心删掉                       |
| `prepack`          | 打包（`npm pack` / `npm publish`）之前自动执行，保证发布的 `dist` 是最新的             |

依赖分三种，放错了是常见的事故：

- **`dependencies`**：运行时需要的包，用户安装你的包时会一起装上
- **`devDependencies`**：只有开发时需要的（`typescript`、`vitest`、`eslint`），用户不会装
- **`peerDependencies`**：需要和用户的项目 **共用同一份** 的包。比如一个 React 组件库，如果自己带一份 React，用户的项目里就会有两份 React，互相不认识。写成 peer 依赖，意思是"请用你项目里的那份"

`@types/xxx` 放哪里？如果你的 `.d.ts` 里引用了它的类型（比如导出的函数参数用了 `Buffer`），用户也需要它，就得放 `dependencies`；只在实现里用到，就放 `devDependencies`。

### 语义化版本

版本号 `主.次.修订`（major.minor.patch）是一种承诺：

- **修订号**：修了 bug，接口不变
- **次版本号**：新增了功能，老代码不受影响
- **主版本号**：有不兼容的改动，用户升级时可能要改代码

对 TypeScript 库来说，**类型也是接口的一部分**。把一个参数的类型从 `string | number` 收窄成 `string`，或者给一个用户需要实现的接口加一个必填属性，用户的代码就可能编译不过了，这是不兼容的改动。这也是 `isolatedDeclarations` 有价值的原因之一。

用户的 `package.json` 里写 `"^1.2.0"`，意思是"1.2.0 及以上，但小于 2.0.0"，自动接受次版本和修订版的更新。`0.x` 版本是例外：`^0.3.1` 只接受 `0.3.x`，因为 0 开头的版本约定"还不稳定，次版本号就可能有不兼容的改动"。

## 只发布 ESM

过去很多库同时发布 ESM 和 CJS 两份代码（"双格式"包）。这带来一个隐患叫 **双包问题**（dual package hazard）：同一个进程里，有的代码 `import` 到 ESM 版，有的代码 `require` 到 CJS 版，结果包被加载了两次。两份代码里的 `class ApiError` 是两个不同的类，`instanceof` 判断会失败；模块级的状态（比如一个注册表）也有两份。

4.1 节讲过，现在的 Node 能 `require` 没有顶层 `await` 的 ESM。所以新库的推荐做法很简单：**只发布 ESM**，`engines` 写上能 `require(esm)` 的最低版本，模块顶层不要写 `await`。章末的 `@learn-ts/agent-kit` 就是这么做的。

## 发布之前检查

**看看会发布哪些文件**：

```bash
npm pack --dry-run
```

示例代码运行了它，并且展示了一个常见的错误：测试文件被编译、被打包了。`files` 是白名单，但白名单里的目录会整个带上，所以要么编译时排除测试，要么在 `files` 里用 `!` 排除。

**检查 package.json 写得对不对**：社区有两个常用的工具。[publint](https://publint.dev) 检查 `exports` 指向的文件是否存在、条件顺序是否正确等；[Are the Types Wrong?](https://arethetypeswrong.github.io)（`attw`）专门检查用户在各种 `moduleResolution` 设置下能不能拿到正确的类型。本节练习自己实现了其中最常见的几项检查。

**像用户一样用一次**：最可靠的检查是在一个全新的目录里安装打包出来的 `.tgz`，导入、运行、类型检查。章末项目的测试就是这样验证 `@learn-ts/agent-kit` 的。

> 本课程不会真的把包发布到 npm。真要发布时，`npm publish --access public`（作用域包默认是私有的）。发布前确保 `version` 已经更新：npm 上同一个版本号只能发布一次，发布后也不能修改。

## 小结

- 库要交付 `.js` 和 `.d.ts`；source map 和 declaration map 让报错和"跳转到定义"指向源码
- 用单独的 tsconfig 编译：`outDir`、`declaration`、`rewriteRelativeImportExtensions`，排除测试文件
- `isolatedDeclarations` 要求导出都写明类型：生成 `.d.ts` 更快，公开接口也更稳定
- `files` 是白名单；`dependencies`/`devDependencies`/`peerDependencies` 不要放错
- 类型是接口的一部分，改类型也要遵守语义化版本
- 新库只发布 ESM；发布前用 `npm pack --dry-run` 看文件，用 publint/attw 检查配置

## 练习

[exercises/04-tooling/03-package-lint.ts](../../exercises/04-tooling/03-package-lint.ts)：写一个发布前的检查器 `lintPackage`，找出 `package.json` 和打包文件列表里的常见错误。运行 `pnpm ex 03-package-lint`。

下一节：[4.4 声明文件](04-declaration-files.md)
