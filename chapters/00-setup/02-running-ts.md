# 0.2 TS 代码是怎么跑起来的：tsc、tsx 与 Node

> 这一节要解决的问题：上一节的示例明明有类型错误，为什么还能运行？类型检查到底发生在什么时候、由谁来做？

## 一句话答案

**类型检查和运行是两件独立的事。** TypeScript 的类型只在开发时存在，运行前会被完整地去掉。

看一个函数：

```ts
function add(a: number, b: number): number {
  return a + b;
}
```

去掉类型之后，交给 Node.js 运行的其实是：

```js
function add(a, b) {
  return a + b;
}
```

`: number` 这些标注全部消失了，运行时没有任何代码在检查 `a` 是不是数字。类型能帮你做的所有事情，都发生在 **运行之前**：编辑器里的红色波浪线、`tsc` 报出的错误。

这和 Python 的类型标注（type hints）很像：Python 解释器也不管标注，检查要靠 mypy / pyright 这样的工具。区别在于 TS 的检查器更强大，而且整个生态都默认你会用它。

## 三个工具，两件事

| 工具           | 检查类型 | 运行代码 | 速度                   | 本仓库用来                       |
| -------------- | :------: | :------: | ---------------------- | -------------------------------- |
| `tsc`          |    ✅    |    ❌    | 较慢（要分析整个项目） | 检查整个项目的类型               |
| `tsx`          |    ❌    |    ✅    | 很快                   | 运行示例，支持全部 TS 语法       |
| `node 文件.ts` |    ❌    |    ✅    | 很快                   | 运行示例（只支持"可擦除"的语法） |

### `tsc`：类型检查器（和编译器）

`tsc` 是 TypeScript 官方的命令行工具，它能做两件事：

1. **类型检查**：分析所有代码，报告类型错误
2. **输出 JS**：把 `.ts` 文件转换成 `.js` 文件

本仓库的 `tsconfig.json` 设置了 `noEmit: true`，只让它做第一件事。运行：

```bash
pnpm typecheck            # 等价于 pnpm exec tsc
pnpm typecheck --watch    # 监听模式：文件一改就重新检查
```

> 本仓库使用的是 **TypeScript 7**：`tsc` 被用 Go 重写成了原生程序，比之前基于 JavaScript 的版本快大约 10 倍。语法和类型系统与 TypeScript 5.x 基本一致，变化主要在配置的默认值和一些被移除的旧选项上（下一节会讲到）。所以网上大多数 TS 5.x 的教程依然适用。

### `tsx`：直接运行 TS

[tsx](https://tsx.is/) 在运行前一瞬间把类型去掉，然后交给 Node.js。它 **不做类型检查**，所以非常快。

```bash
pnpm tsx chapters/00-setup/examples/01-hello.ts
pnpm tsx watch 某个文件.ts    # 监听模式：文件一改就重新运行
```

### `node 文件.ts`：Node.js 原生运行 TS

从 Node.js 22.18 / 23.6 开始，Node 可以直接运行 `.ts` 文件，不需要任何参数：

```bash
node chapters/00-setup/examples/01-hello.ts
```

Node 的做法叫 **类型剥离（type stripping）**：把类型标注原地替换成空格，其他一个字符都不动。所以报错时的行号、列号和你的源码完全一致，调试时也不需要额外的映射文件。

代价是它只认识 **可以直接擦掉** 的语法。TypeScript 有少数几个特性会生成运行时代码，比如 `enum`：

```ts
enum Color {
  Red,
}
```

`enum` 擦掉之后什么都不剩，可代码里还在用 `Color.Red`，所以 Node 会直接拒绝：

```
SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript enum is not supported in strip-only mode
```

本仓库在 `tsconfig.json` 里开启了 `erasableSyntaxOnly`，让 `tsc` 提前禁止这类语法。好在我们完全不需要它们：第 1 章会讲到，`enum` 能做的事用字面量联合类型做得更好。

另外两条 Node 的规则：

- `import` 相对路径时必须写完整的文件名，包括 `.ts` 后缀：`import { x } from "./x.ts"`
- 只导入类型时要写 `import type`，让 Node 知道这一行可以整行删掉

本仓库的配置会让 `tsc` 帮你检查这两条，写错了编辑器会提示。

## 关键结论：运行 ≠ 检查

回到上一节的问题。`01-hello.ts` 里的 `greet(42)`：

- `tsc` 报错：`42` 不能赋值给 `string` 参数（示例里用 `@ts-expect-error` 注释把这个错误标记成了"预期之中"，删掉注释再运行 `pnpm typecheck` 就能看到）
- `tsx` 和 `node` 照常运行：它们只负责去掉类型，根本不看类型对不对

这不是缺陷，而是刻意的设计：让"运行"保持极快，把"检查"交给编辑器和 `tsc`。所以本仓库的日常工作流是：

1. **写代码时**：编辑器实时显示类型错误（它在后台跑的就是 TS 的类型检查）
2. **运行时**：用 `tsx` 或 `node`，秒开
3. **提交前**：`pnpm check`，用 `tsc` 检查整个项目，检查格式和 lint（第 4 章讲），再跑全部测试
4. **CI**：每次推送和提交 PR，GitHub Actions 都会再做一遍同样的检查

## 类型管不到运行时的数据

既然类型在运行时不存在，那么运行时才出现的数据，类型系统就没法替你把关。看示例 [examples/02-types-are-erased.ts](examples/02-types-are-erased.ts)：

```ts
interface Usage {
  inputTokens: number;
  outputTokens: number;
}

function total(usage: Usage): number {
  return usage.inputTokens + usage.outputTokens;
}

// 假设这段 JSON 来自某个 API 的响应，对方把数字写成了字符串
const body = '{"inputTokens": "100", "outputTokens": 20}';
const fromNetwork: Usage = JSON.parse(body);

console.log(total(fromNetwork)); // "10020" —— 不是 120！
```

`tsc` 不会报任何错：`JSON.parse` 的返回类型是 `any`（"随便什么都行"），可以赋值给任何类型。我们 **声称** 它是 `Usage`，TypeScript 就相信了。运行时 `"100" + 20` 在 JavaScript 里是字符串拼接，结果是 `"10020"`。

对 agent 开发来说，这是一个必须牢记的事实：**模型的输出、API 的响应、用户的输入，都是运行时数据，类型系统看不到它们。** 第 1 章会学习用 `unknown` 安全地处理这类数据，第 5 章会学习用 Zod 在运行时校验它们，并自动得到对应的类型。

运行这个示例，亲眼看看：

```bash
pnpm tsx chapters/00-setup/examples/02-types-are-erased.ts
```

## 小结

- 类型只在开发时存在，运行前会被擦除；运行时没有任何类型检查
- `tsc` 负责检查（本仓库不用它输出 JS），`tsx` 和 `node` 负责运行
- Node.js 原生运行 TS 只支持可擦除的语法，本仓库用 `erasableSyntaxOnly` 保证这一点
- 来自外部的数据（JSON、API 响应、模型输出）不受类型保护，需要运行时校验

下一节：[0.3 逐行读懂 tsconfig.json](03-tsconfig.md)
