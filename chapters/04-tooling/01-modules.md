# 4.1 模块：ESM 与 CommonJS

> 这一节要解决的问题：到目前为止，每个文件都用 `import` 和 `export` 互相引用，一切"自然就能用"。可一旦开始引入别人的包、把自己的代码拆成包，就会遇到 `ERR_REQUIRE_ESM`、`Cannot use import statement outside a module`、`TS2835` 这样的报错。Node.js 到底按什么规则加载一个文件？TypeScript 又是怎么跟上这套规则的？

示例代码：[examples/01-modules.ts](examples/01-modules.ts)

这一章换个方向：不再学新的类型技巧，而是学 **工程**：模块、包、声明文件、lint、测试、目录结构和性能分析。章末，我们会把第 2 章的工具注册表和第 3 章的模型客户端打包成一个真正的包 `@learn-ts/agent-kit`，之后的 harness 直接导入它。

## 两套模块系统

JavaScript 有两套模块系统，这是历史造成的：

|          | CommonJS（CJS）                        | ECMAScript 模块（ESM）                    |
| -------- | -------------------------------------- | ----------------------------------------- |
| 来历     | 2009 年 Node.js 自己设计的             | 2015 年写进语言标准，浏览器和 Node 都支持 |
| 导入     | `const fs = require("node:fs")`        | `import fs from "node:fs"`                |
| 导出     | `module.exports = ...`、`exports.x = ` | `export const x = ...`、`export default`  |
| 加载时机 | 运行到 `require` 那一行才同步加载      | 先解析所有 `import`，加载完才开始执行     |
| 顶层等待 | 不支持                                 | 支持顶层 `await`                          |

新代码应该一律写 ESM，本仓库也是。但 npm 上还有大量 CJS 的包，所以你需要知道两者怎么相处。

### ESM 是静态的

ESM 的 `import` 必须写在模块顶层，路径必须是字符串字面量。这样，Node 在执行任何代码之前，就能读出完整的依赖关系，先把所有依赖加载好。打包工具也靠这一点做"摇树优化"（tree shaking）：没有被导入的导出，可以直接从产物里删掉。

另一个区别是 **活的绑定**：导入方拿到的不是值的拷贝，而是指向导出变量本身。

```ts
// counter.ts
export let count = 0;
export function increment(): void {
  count++;
}

// main.ts
import { count, increment } from "./counter.ts";
increment();
console.log(count); // 1：看到的是 counter.ts 里那个变量的当前值
```

导入的绑定是只读的：`main.ts` 里写 `count = 5` 会报错，只有导出它的模块能修改。

## Node.js 怎么判断一个文件是哪种模块

同一段代码，Node 可能按 ESM 执行，也可能按 CJS 执行，规则只看两样东西：**文件扩展名**，和 **离它最近的 `package.json` 里的 `"type"` 字段**。

| 扩展名         | `"type": "module"` | `"type": "commonjs"` | 没有 `"type"`               |
| -------------- | ------------------ | -------------------- | --------------------------- |
| `.mjs`、`.mts` | ESM                | ESM                  | ESM                         |
| `.cjs`、`.cts` | CJS                | CJS                  | CJS                         |
| `.js`、`.ts`   | ESM                | CJS                  | 看语法：有 ESM 语法就是 ESM |

最后一列是 Node 22 起的"语法检测"：没有声明 `"type"` 时，Node 先按 CJS 解析，遇到 `import`/`export` 语句、`import.meta` 或者顶层 `await` 这类只有 ESM 才有的语法，再改按 ESM 加载。它是为了照顾旧项目，不要依赖它：每次都要多猜一次，而且结果取决于文件内容。**自己的项目永远在 `package.json` 里写明 `"type"`**。本仓库写的是 `"type": "module"`。

反过来，扩展名明确说了格式时，Node 不会再猜：`.cjs` 文件里写 `import`，或者 `"type": "commonjs"` 时 `.js` 文件里写 `export`，都会直接报 `SyntaxError`。

## TypeScript 怎么跟上

`tsconfig.json` 里的 `"module": "nodenext"` 告诉 TypeScript："完全按照 Node 的规则来"。于是它用同一张表判断每个 `.ts` 文件是 ESM 还是 CJS，并据此检查你的写法。几个常见的报错：

```text
error TS2835: Relative import paths need explicit file extensions in ECMAScript imports
when '--moduleResolution' is 'node16' or 'nodenext'. Did you mean './a.js'?
```

ESM 里的相对路径必须写扩展名。这是 Node 的规则：ESM 不会像 `require` 那样自动尝试 `.js`、`/index.js`。本仓库直接写 `.ts` 扩展名（`import ... from "./a.ts"`），因为代码由 Node 直接运行，磁盘上的文件就叫 `a.ts`。允许这么写的是 `allowImportingTsExtensions`（[0.3 节](../00-setup/03-tsconfig.md)）。需要编译成 `.js` 发布的时候怎么办，4.3 节再讲。

```text
error TS1286: ECMAScript imports and exports cannot be written in a CommonJS file
under 'verbatimModuleSyntax'.
```

在 `.cts` 文件（或 `"type": "commonjs"` 下的 `.ts` 文件）里写了 `import`。`verbatimModuleSyntax` 的意思是"你写的模块语法就是最终运行的语法"，TypeScript 不会帮你把 `import` 改写成 `require`，所以它要求 CJS 文件老老实实写 `require`。

```text
error TS1484: 'Message' is a type and must be imported using a type-only import
when 'verbatimModuleSyntax' is enabled.
```

0.3 节讲过：只导入类型要写 `import type`。也可以在一条 `import` 里给单个名字加 `type`：`import { type Message, createMessage } from "./message.ts"`。

## ESM 与 CJS 互相导入

示例代码的第 2、3 部分演示了这些行为。

**ESM 导入 CJS** 总是可以的。CJS 模块的 `module.exports` 整体作为默认导出：

```ts
import greet from "./greet.cjs"; // module.exports = function greet() {...}
```

Node 还会静态分析 CJS 代码，识别出 `exports.add = ...` 这样的写法，让你可以按名字导入：`import { add } from "./tools.cjs"`。但这只是尽力而为：`module.exports` 如果是运行时才拼出来的对象，分析不出来，就只能用默认导出。

**CJS 导入 ESM** 曾经是个大麻烦：`require` 是同步的，而 ESM 可以有顶层 `await`，所以过去只能写 `await import(...)`，在 CJS 里还得包在 async 函数里。现在的 Node（22.12 起、20.19 起）支持直接 `require` 一个 ESM 模块，得到它的模块命名空间对象。唯一的限制是那个模块（以及它的依赖）不能有顶层 `await`，否则报 `ERR_REQUIRE_ASYNC_MODULE`。

这意味着：**今天发布一个纯 ESM 的库，CJS 的用户也能用**。所以 4.3 节打包时，我们会只发布 ESM。

## `import.meta`：当前模块的信息

ESM 里没有 CJS 的 `__dirname`、`__filename` 和 `require`，取而代之的是 `import.meta`：

| 写法                        | 含义                                           |
| --------------------------- | ---------------------------------------------- |
| `import.meta.url`           | 当前文件的 URL，`file:///.../main.ts`          |
| `import.meta.filename`      | 当前文件的绝对路径（相当于 `__filename`）      |
| `import.meta.dirname`       | 当前文件所在目录（相当于 `__dirname`）         |
| `import.meta.resolve(spec)` | 按导入规则把说明符解析成 URL，但不加载这个模块 |

练习和测试里常常用 `join(import.meta.dirname, "fixtures")` 找到与当前文件相邻的资源，不依赖运行命令时所在的目录。

真的需要 `require` 的时候（比如找一个包的 `package.json`），用 `createRequire(import.meta.url)` 造一个。

## 动态 `import()`

`import` 语句是静态的，但 `import()` 表达式可以在运行时决定加载什么，返回一个 Promise，结果是模块命名空间对象：

```ts
const { default: plugin } = await import(pathToFileURL(file).href);
```

几个要点：

- **参数是说明符，不是文件路径**。相对路径相对于 _当前模块_，而不是当前工作目录；绝对路径要用 `pathToFileURL` 转成 `file://` URL（在 Windows 上，`C:\...` 会被当成协议名 `c:`）
- **路径是字面量时，TypeScript 知道结果的类型**：`await import("./tools.ts")` 的类型就是那个模块的全部导出。只想要类型、不想加载时，可以写 `typeof import("./tools.ts")`
- **路径是变量时，结果是 `Promise<any>`**。TypeScript 不可能知道运行时会加载哪个文件。这正是 [1.7 节](../01-basics/07-any-unknown-never.md)说的"边界"：把结果当 `unknown`，验证之后再用

动态导入的典型用途是插件：harness 启动时扫描一个目录，加载里面的每个工具。本节练习就是写这样一个加载器。另一个用途是延迟加载：只有用户真的用到某个很重的功能时，才去加载它。

## 导入 JSON

```ts
import config from "./config.json" with { type: "json" };
```

`with { type: "json" }` 是导入属性（import attributes），告诉运行时"按 JSON 解析这个文件"。这是安全措施：如果服务器把 `config.json` 换成了一段 JavaScript，没有这个声明的话它就会被执行。Node 要求必须写，不写就报 `ERR_IMPORT_ATTRIBUTE_MISSING`；`tsc` 在 `nodenext` 下也会提前报 `TS1543`。

TypeScript 会根据 JSON 文件的内容推断出类型。不过对于运行时才读的配置（用户写的配置文件），还是用 `fs.readFile` + `JSON.parse` + 校验，不要相信推断出的类型。

## 循环导入

两个模块互相导入时，ESM 能处理，但会出现一个模块还没执行完、另一个就要用它的导出的情况。这时访问一个还没初始化的 `const`/`let`/`class`，会得到 `ReferenceError: Cannot access 'x' before initialization`。

只在函数 _被调用时_ 才用到的导入没问题（那时两个模块都执行完了）；在模块顶层立刻用到的导入才会出事。遇到这种错误，通常的解决办法是把两边都要用的东西挪到第三个模块里。4.7 节会讲怎么在包的层面杜绝循环依赖。

## 小结

- 新代码写 ESM；`package.json` 里永远写明 `"type"`
- Node 按扩展名和最近的 `"type"` 判断模块格式；`.mts`/`.cts` 和 `.mjs`/`.cjs` 不看 `"type"`
- `module: "nodenext"` 让 TypeScript 用和 Node 一样的规则检查代码；`verbatimModuleSyntax` 要求"写什么就运行什么"
- ESM 可以导入 CJS（`module.exports` 是默认导出）；现在的 Node 也能 `require` 没有顶层 `await` 的 ESM
- `import.meta.dirname` 代替 `__dirname`；动态 `import()` 的路径是变量时，结果要当 `unknown` 处理
- 导入 JSON 要写 `with { type: "json" }`

## 练习

[exercises/04-tooling/01-modules.ts](../../exercises/04-tooling/01-modules.ts)：实现 `moduleFormat`，用代码写出上面那张判断表（测试会拿你的答案和真实的 Node 对比）；再实现一个插件式的工具加载器 `loadTools`。运行 `pnpm ex 01-modules`。

下一节：[4.2 包的解析：exports 与 imports](02-resolution.md)
