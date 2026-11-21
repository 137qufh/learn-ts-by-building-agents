# 4.2 包的解析：exports 与 imports

> 这一节要解决的问题：写下 `import { z } from "zod"` 的时候，Node 是怎么找到磁盘上那个文件的？TypeScript 又是从哪里拿到类型的？自己写一个包时，怎么规定别人能导入什么、不能导入什么？

示例代码：[examples/02-resolution.ts](examples/02-resolution.ts)

## 三种说明符

`import` 后面那个字符串叫 **说明符**（specifier），有三种：

| 种类     | 例子                               | 怎么找                                                 |
| -------- | ---------------------------------- | ------------------------------------------------------ |
| 相对     | `"./tools.ts"`、`"../util/log.ts"` | 相对于当前文件，必须写完整的文件名（4.1 节）           |
| 内置模块 | `"node:fs"`、`"node:path"`         | Node 自带的模块，`node:` 前缀让人一眼认出它不是 npm 包 |
| 裸说明符 | `"zod"`、`"@scope/pkg/sub"`        | 包名 + 可选的子路径，在 `node_modules` 里找            |

裸说明符的查找分两步。第一步，**找到包**：从当前文件所在目录开始，看 `node_modules/zod` 是否存在；没有就去上一级目录的 `node_modules` 找，一直找到根目录。第二步，**在包里找文件**：读包的 `package.json`，看它的 `exports` 字段。这一节主要讲第二步。

## `exports`：包的公开接口

```json
{
  "name": "tiny-kit",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./tools/*": "./dist/tools/*.js",
    "./package.json": "./package.json"
  }
}
```

键是 **子路径**：`"."` 是包本身（`import "tiny-kit"`），`"./tools/*"` 对应 `import "tiny-kit/tools/search"`。值是包里的文件，必须以 `./` 开头。

`exports` 最重要的作用是 **封装**：一旦写了 `exports`，没列出来的文件就导入不到。示例里导入 `tiny-kit/dist/helpers.js` 会得到：

```text
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './dist/helpers.js' is not defined by "exports"
```

这对包的作者是好事：内部文件可以随便改名、拆分，不会弄坏别人的代码。公开的接口就是 `exports` 里列出的这几项，其余都是实现细节。

> 没有 `exports` 的老式包，Node 用 `main` 字段找入口，子路径直接对应包里的文件。新写的包都应该用 `exports`。

### 子路径模式

`"./tools/*"` 里的 `*` 匹配任意字符串（可以包含 `/`），目标里的 `*` 会换成同样的内容：`tiny-kit/tools/web/fetch` → `./dist/tools/web/fetch.js`。

多个模式都能匹配时，**最具体的优先**（`*` 前面的部分更长的那个）。值为 `null` 表示明确排除：

```json
{
  "exports": {
    "./tools/*": "./dist/tools/*.js",
    "./tools/internal-*": null
  }
}
```

`tiny-kit/tools/internal-secret` 两个模式都匹配，后者更具体，结果是 `null`：导入不到。

## 条件导出

同一个子路径，可以按 **条件** 给出不同的文件：

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}
```

解析时，Node 有一组当前生效的条件，**按键的书写顺序** 找第一个生效的条件，用它的值（值还可以是嵌套的条件对象）。常见的条件：

| 条件      | 什么时候生效                                   |
| --------- | ---------------------------------------------- |
| `import`  | 用 `import` / `import()` 加载                  |
| `require` | 用 `require()` 加载                            |
| `node`    | 在 Node.js 里（相对于浏览器、Deno 等环境）     |
| `types`   | TypeScript 查找类型时（Node 自己不认这个条件） |
| `default` | 永远生效，作为兜底，应该放在最后               |

注意是"书写顺序"，不是"条件的优先级"。`types` 要写在 `import`、`require`、`node`、`default` 前面：TypeScript 解析时这几个条件也是生效的，如果 `import` 写在前面，就会先命中 `./dist/index.js`，再去找它旁边的 `index.d.ts`。类型文件恰好在旁边时侥幸能用，不在旁边（比如放在单独的 `types/` 目录里）就找不到了，`types` 条件形同虚设。`default` 必须写在最后，写在前面的话，后面的条件永远轮不到。

### 自定义条件

条件名可以自己起。运行 Node 时加上 `--conditions=名字`（简写 `-C 名字`），这个条件就会生效。最常见的用法是在开发时直接使用源码：

```json
{
  "exports": {
    ".": {
      "tiny-kit/source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  }
}
```

发布出去之后，用户的环境里没有 `tiny-kit/source` 这个条件，用的是编译好的 `dist`；而在同一个仓库里开发时，加上这个条件就能直接用 `src` 里的 `.ts` 文件，改完不用重新编译。源码条件写在 `types` 前面，是因为开启它的时候（TypeScript 也可以开启它，见下文），它应该胜出：类型也直接从源码里读。条件名带上包名做前缀，是为了不和别的包撞车（如果你的条件叫 `source`，另一个依赖恰好也用了 `source` 条件，它就会被意外打开）。

示例代码的第 4 部分揭示了一个限制：Node **不会剥离 `node_modules` 里的 `.ts` 文件的类型**，会报 `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`。这是有意的设计，发布到 npm 的包应该是编译好的 JavaScript。不过工作区（4.7 节）里的包是例外：`node_modules` 里只是一个指向 `packages/` 的符号链接，Node 按真实路径判断，所以源码条件在工作区里可以正常使用。章末项目就是这样做的。

## `imports`：包内部的别名

`exports` 规定别人怎么导入你；`imports` 字段规定 **你自己的代码** 怎么导入你自己的文件。键必须以 `#` 开头：

```json
{
  "imports": {
    "#log": { "node": "./dist/log-node.js", "default": "./dist/log-browser.js" },
    "#test-utils/*": "./test/utils/*.ts"
  }
}
```

包里任何位置的文件都可以写 `import { log } from "#log"`，不用数 `../../..`。它同样支持条件和模式，TypeScript 也认识它。和 `exports` 一样，它只在包的范围内有效，别的包看不到。

## TypeScript 怎么找类型

`moduleResolution` 决定了 TypeScript 用什么规则解析说明符。本仓库用的 `module: "nodenext"` 隐含了 `moduleResolution: "nodenext"`，也就是 **和 Node 完全一样的规则**，只是额外加上 `types` 条件。对每个导入，TypeScript 这样找类型：

1. 按 `exports`（启用 `types`、`import` 或 `require`、`node` 条件以及 `customConditions`）找到目标文件
2. 目标是 `.d.ts` 或 `.ts`：直接用
3. 目标是 `.js`：找旁边同名的 `.d.ts`（`./dist/index.js` → `./dist/index.d.ts`）
4. 包里都没有：去 `node_modules/@types/包名` 里找（4.4 节）

看 TypeScript 到底是怎么解析的，用 `--traceResolution`：

```bash
pnpm tsc --traceResolution | grep "successfully resolved"
```

```text
======== Module name '@x/kit' was successfully resolved to '/repo/packages/kit/src/index.ts' ... ========
```

上面讲的自定义条件，TypeScript 用 `customConditions` 选项开启：

```json
{ "compilerOptions": { "customConditions": ["tiny-kit/source"] } }
```

这样在仓库里，类型检查和跳转定义都直接指向源码。

### `nodenext` 和 `bundler`

`moduleResolution` 的另一个现代选项是 `bundler`，给用打包工具（Vite、esbuild、webpack）的前端项目用：它同样支持 `exports`，但不要求相对导入写扩展名，因为打包工具不要求。

怎么选？**代码最终由 Node 直接运行（或者要发布成给 Node 用的包），就用 `nodenext`**；用打包工具构建的应用，用 `bundler`。用 `bundler` 写库是个陷阱：省掉的扩展名在 Node 里会直接报错，而 `tsc` 不会提醒你。本仓库从头到尾都用 `nodenext`。

> 你还会在老项目里看到 `moduleResolution: "node"`（也叫 `node10`）。它模仿的是 2010 年代的 `require`，完全不认识 `exports`，已经废弃了。

## 小结

- 说明符有三种：相对路径、`node:` 内置模块、裸说明符（包名 + 子路径）
- `exports` 是包的公开接口：没列出来的子路径导入不到；`*` 模式按最具体优先；`null` 排除
- 条件按书写顺序匹配：`types` 写在 `import`/`require`/`default` 之前，`default` 写最后
- 自定义条件 + `--conditions` / `customConditions` 可以让开发时直接用源码；Node 不剥离 `node_modules` 里的 `.ts`，但工作区的符号链接不受影响
- `imports`（`#` 开头）是包内部的别名
- `moduleResolution: "nodenext"` = Node 的规则 + `types` 条件；给 Node 用的代码不要用 `bundler`

## 练习

[exercises/04-tooling/02-exports.ts](../../exercises/04-tooling/02-exports.ts)：自己实现 `exports` 的解析算法（测试会拿真实的 Node 来对答案），再给一个包写出满足要求的 `exports`。运行 `pnpm ex 02-exports`。

下一节：[4.3 打包一个库](03-publishing.md)
