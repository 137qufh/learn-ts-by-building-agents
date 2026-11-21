# 0.3 逐行读懂 tsconfig.json

> 这一节要解决的问题：`tsconfig.json` 决定了 TypeScript "有多严格"、"按什么规则找文件"。网上抄来的配置往往一堆过时选项，我们逐行看懂本仓库的配置，以后你就能为自己的项目写出合适的配置。

第一次读可以只看每一项的 **一句话解释**，遇到问题再回来细看。

## 完整配置

```jsonc
{
  "compilerOptions": {
    /* 语言与运行环境 */
    "target": "es2025",
    "lib": ["es2025"],
    "types": ["node"],

    /* 模块：按 Node.js 的规则解析 import */
    "module": "nodenext",
    "moduleDetection": "force",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,

    /* 只做类型检查，不输出 .js */
    "noEmit": true,

    /* 严格程度 */
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,

    /* 其他 */
    "skipLibCheck": true,
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules"],
}
```

`include` 表示检查仓库里所有 `.ts` 文件，`exclude` 把第三方依赖排除在外。下面按分组讲 `compilerOptions`。

## 语言与运行环境

### `target: "es2025"`

**一句话：代码会运行在支持 ES2025 的环境里。**

ECMAScript（简称 ES）是 JavaScript 的语言标准，每年发布一版。`target` 的主要作用是告诉 `tsc` 输出哪个版本的 JS 语法（比如为老浏览器把新语法改写成旧语法），它还决定了 `lib` 的默认值。我们既不输出 JS，又显式写了 `lib`，所以它在这里影响很小，写出来主要是为了表明代码面向的运行环境。Node.js 24 已经支持 ES2025 的新特性（如迭代器辅助方法、`Set` 的集合运算、`Promise.try`）。

### `lib: ["es2025"]`

**一句话：可以使用哪些内置 API 的类型。**

`lib` 决定了 `Array.prototype.includes`、`Promise`、`Map` 这些内置对象的类型声明从哪里来。如果不写，TypeScript 会根据 `target` 选择默认值，并且 **默认包含浏览器的 DOM 类型**（`document`、`window` 等）。我们的代码只跑在 Node.js 上，显式写成 `["es2025"]` 可以把 DOM 排除掉：这样不小心用了 `document`，`tsc` 会直接报错，而不是等到运行时崩溃。

### `types: ["node"]`

**一句话：加载 Node.js 的全局类型（`process`、`console`、`Buffer` 等）。**

`@types/node` 这个包描述了 Node.js 提供的 API。从 TypeScript 6 开始，`types` 的默认值是空数组 `[]`，也就是 **不会自动加载** 任何 `@types/*` 包，需要显式列出。如果去掉这一行，连 `console.log` 都会报错：

```
error TS2584: Cannot find name 'console'.
error TS2591: Cannot find name 'process'. Do you need to install type definitions for node?
```

看到这类"找不到名字"的错误，先检查 `types` 和 `lib`。

## 模块

### `module: "nodenext"`

**一句话：完全按照 Node.js 的规则来理解 `import`。**

Node.js 有两套模块系统：老的 CommonJS（`require`）和标准的 ES Modules（`import`）。用哪套取决于 `package.json` 的 `"type"` 字段和文件后缀。本仓库的 `package.json` 写了 `"type": "module"`，所以所有 `.ts` 文件都是 ES Module。

`nodenext` 让 `tsc` 模拟 Node.js 的真实行为，包括：相对路径的 `import` 必须写文件后缀。它同时隐含了 `moduleResolution: "nodenext"`，所以不用再写一遍。

> 如果你的代码要交给 Vite、esbuild 这类打包工具处理，而不是直接由 Node.js 运行，社区常用的是 `"module": "preserve"`（隐含 `moduleResolution: "bundler"`）。第 4 章讲工程化时会对比。

### `moduleDetection: "force"`

**一句话：每个文件都是独立的模块，变量不会跨文件冲突。**

在旧的"脚本"模式下，没有 `import`/`export` 的文件共享同一个全局作用域：两个示例文件都声明 `const name` 就会冲突。在 `nodenext` + `"type": "module"` 下文件本来就都是模块，这里显式写出来，避免以后改了其他配置时踩坑。

### `allowImportingTsExtensions: true`

**一句话：允许写 `import { x } from "./x.ts"`。**

Node.js 原生运行 TS 时，导入的必须是磁盘上真实存在的文件名，也就是 `./x.ts`。默认情况下 `tsc` 不允许 `.ts` 后缀（因为编译输出的是 `.js`，路径会对不上），这个选项解除了限制。它要求同时开启 `noEmit`（或者让 `tsc` 只输出类型声明），正好符合我们的用法。

> 你在网上可能会看到 `import { x } from "./x.js"` 这种"导入一个不存在的 .js 文件"的写法。那是需要用 `tsc` 输出 JS 的项目（比如要发布的 npm 包）的惯例，第 4 章会讲。

### `verbatimModuleSyntax: true`

**一句话：只导入类型时，必须写 `import type`。**

```ts
import type { Message } from "./types.ts"; // 只用作类型：整行可以安全删除
import { createMessage } from "./types.ts"; // 用到了运行时的值：保留
```

去掉类型的工具（Node、tsx、esbuild）是一个文件一个文件处理的，它们不知道别的文件里 `Message` 是类型还是值。`import type` 把这件事写明，让它们可以放心地删掉整行。写错时 `tsc` 会提示：

```
error TS1484: 'Message' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.
```

也可以混合写：`import { createMessage, type Message } from "./types.ts"`。

### `erasableSyntaxOnly: true`

**一句话：禁止 `enum`、`namespace` 这类会生成运行时代码的 TS 语法。**

上一节讲过，Node.js 原生运行 TS 只支持"可以直接擦掉"的语法。开启这一项，`tsc` 会在你写下 `enum` 的那一刻报错，而不是等 Node 运行时才失败。被禁止的主要有：`enum`、包含代码的 `namespace`、类构造函数的参数属性（`constructor(private x: number)`）。它们都有更好的替代写法，后面的章节会讲。

## 只做检查：`noEmit: true`

**一句话：`tsc` 只检查类型，不生成 `.js` 文件。**

本仓库的代码由 `node`、`tsx`、`vitest` 直接运行，不需要 `tsc` 输出任何东西。需要构建产物的场景（比如发布 npm 包）第 4 章再讲。

## 严格程度

### `strict: true`

**一句话：开启全部"严格"类型检查。**

`strict` 是一组选项的总开关，包括 `strictNullChecks`（`null` 和 `undefined` 不能随便当成别的类型用）、`noImplicitAny`（不允许悄悄推断出 `any`）等。从 TypeScript 6 开始它默认就是 `true`，这里写出来是为了一眼可见。

**不要关掉它。** 关掉 `strict` 的 TypeScript 会放过大量真实的 bug，也就失去了用 TS 的大半意义。第 1 章的 [1.8 严格模式](../01-basics/08-strictness.md) 会逐个演示这些选项能拦住什么错误。

### `strict` 之外的几项

这几项不在 `strict` 里，但在追求质量的项目里很常见。这里只给一句话，第 1 章会详细演示：

| 选项                         | 一句话                                                              |
| ---------------------------- | ------------------------------------------------------------------- |
| `noUncheckedIndexedAccess`   | `arr[i]` 的类型带上 `\| undefined`，逼你处理"下标越界"              |
| `exactOptionalPropertyTypes` | 可选属性 `x?: string` 表示"可以没有"，但不能显式写成 `x: undefined` |
| `noImplicitOverride`         | 子类覆盖父类方法时必须写 `override`，防止拼错方法名                 |
| `noImplicitReturns`          | 函数的每条分支都必须返回值，防止漏写 `return`                       |
| `noFallthroughCasesInSwitch` | `switch` 的 `case` 不能不写 `break`/`return` 就掉进下一个 `case`    |

## 其他：`skipLibCheck: true`

**一句话：不检查第三方库自带的 `.d.ts` 类型声明文件。**

`.d.ts` 文件只包含类型声明（第 4 章会讲）。第三方库的声明文件偶尔彼此冲突，或者用了与你的配置不兼容的写法，逐一检查它们既慢又没有意义。你自己的代码仍然会被完整检查。几乎所有项目都会开启这一项。

## TypeScript 6/7 的默认值变化

如果你参考的是旧教程，下面这些变化最容易让你困惑：

| 选项     | 以前的默认值          | 现在的默认值 | 影响                                   |
| -------- | --------------------- | ------------ | -------------------------------------- |
| `strict` | `false`               | `true`       | 新项目默认就是严格模式                 |
| `types`  | 自动加载所有 `@types` | `[]`         | 要手动写 `"types": ["node"]`           |
| `target` | `es5`                 | `es2025`     | 不再默认兼容老旧环境，`es5` 已不再支持 |
| `module` | `commonjs`            | `esnext`     | 默认是 ES Module                       |

另外，`baseUrl`、`moduleResolution: "node"`（即 `node10`）、`outFile` 等旧选项已经被移除。教程里如果用到它们，说明那部分内容已经过时了。

## 小结

- `lib` + `types` 决定了"有哪些全局 API 可用"，找不到名字时先查这两项
- `module: "nodenext"` + `allowImportingTsExtensions` + `verbatimModuleSyntax` + `erasableSyntaxOnly` 让同一份代码可以被 `tsc` 检查、被 Node.js 直接运行
- `strict` 永远开着；本仓库还额外开启了几项更严格的检查
- `noEmit`：`tsc` 只当检查器

下一节：[0.4 在 VS Code 里调试](04-debugging.md)
