# 第 4 章：工程化

> 从"能跑的代码"到"别人能用的包"：模块、包的解析、构建与发布、声明文件、lint、测试、monorepo、调试与性能分析。

前三章学的是语言本身。这一章学的是写 TypeScript 项目每天都会碰到、却很少有人系统讲过的东西：Node.js 按什么规则加载一个文件，`package.json` 的 `exports` 怎么决定别人能导入什么，怎么把 `.ts` 编译成能发布的 `.js` 和 `.d.ts`，怎么给一个没有类型的库补上类型，怎么让 ESLint 找出 `tsc` 发现不了的 bug，怎么写可靠的测试，一个仓库里放好几个包时怎么组织，以及代码慢了、卡了、出错了怎么查。

章末项目把第 2 章的工具注册表和第 3 章的流式客户端整理成工作区里的一个真正的包 `@learn-ts/agent-kit`，并写一个"像真实用户一样安装它"的发布前检查。从第 5 章开始，后面的代码都通过包名导入它。

## 学完你能

- 判断一个文件会被当成 ESM 还是 CommonJS，解释 `ERR_REQUIRE_ESM`、`TS2835` 这类报错，并在两种格式之间互相调用
- 读懂和写出 `package.json` 的 `exports`、`imports` 和条件，知道 TypeScript 和 Node 分别怎么解析一个包名
- 用 `tsc` 把一个库编译成 `.js`、`.d.ts` 和 map 文件，理解 `isolatedDeclarations`，写出一份合格的 `package.json`
- 为没有类型的 JavaScript 写声明文件，使用模块扩充和全局声明
- 配置类型感知的 ESLint，用它抓出漂浮的 Promise、错误的 `await` 等 `tsc` 不管的问题
- 用假对象、间谍、假时钟和 fixture 写出快速、确定的测试，知道快照测试什么时候有用
- 用 pnpm 工作区组织多个包，理解构建顺序和"源码条件"
- 用调试器、`--cpu-prof` 和计时工具找到问题和瓶颈

## 前置知识

- [第 2 章](../02-advanced-types/README.md)和[第 3 章](../03-async/README.md)：章末项目打包的就是这两章的项目
- 会在命令行里运行 `pnpm`、`node`（[第 0 章](../00-setup/README.md)）

## 课程目录

| 节  | 内容                                                     | 示例                                                                    | 练习                                                                         |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 4.1 | [模块：ESM 与 CommonJS](01-modules.md)                   | [01-modules.ts](examples/01-modules.ts)                                 | [01-modules](../../exercises/04-tooling/01-modules.ts)                       |
| 4.2 | [包的解析：exports 与 imports](02-resolution.md)         | [02-resolution.ts](examples/02-resolution.ts)                           | [02-exports](../../exercises/04-tooling/02-exports.ts)                       |
| 4.3 | [打包一个库](03-publishing.md)                           | [03-publishing.ts](examples/03-publishing.ts)                           | [03-package-lint](../../exercises/04-tooling/03-package-lint.ts)             |
| 4.4 | [声明文件](04-declaration-files.md)                      | [04-declaration-files.ts](examples/04-declaration-files.ts)             | [04-colors](../../exercises/04-tooling/04-colors.ts)                         |
| 4.5 | [ESLint：类型感知的代码检查](05-linting.md)              | [05-linting.ts](examples/05-linting.ts)                                 | [05-lint-fixes](../../exercises/04-tooling/05-lint-fixes.ts)                 |
| 4.6 | [测试的模式](06-testing.md)                              | [testing/summarize.test.ts](examples/testing/summarize.test.ts)         | [06-test-doubles](../../exercises/04-tooling/06-test-doubles.ts)             |
| 4.7 | [项目结构与 monorepo](07-monorepo.md)                    | [07-monorepo.ts](examples/07-monorepo.ts)                               | [07-build-order](../../exercises/04-tooling/07-build-order.ts)               |
| 4.8 | [调试与性能分析](08-debugging-and-profiling.md)          | [08-debugging-and-profiling.ts](examples/08-debugging-and-profiling.ts) | [08-profiling](../../exercises/04-tooling/08-profiling.ts)                   |
| 4.9 | [章末项目：@learn-ts/agent-kit](09-project-agent-kit.md) | [project/demo.ts](project/demo.ts)                                      | [project/release-check](../../exercises/04-tooling/project/release-check.ts) |

4.1 和 4.2 是后面几节的基础，建议先读。4.5、4.6、4.8 相对独立，可以按需要跳着读。

## 关于这一章的练习

- 好几道练习会拿你的答案和 **真实的工具** 对比：4-1、4-2 的测试会启动真正的 Node 来验证模块格式和 `exports` 解析，4-5 对你的文件运行 ESLint，章末项目会真的执行 `npm pack` 和 `tsc`。所以这些测试比前几章慢一些
- 从这一章开始，`pnpm check` 里多了一步 `pnpm lint`。`exercises/` 平时不参与 lint（没做完的练习里到处是未使用的参数），练习 4-5 会单独检查
- 每道练习都可以单独运行，例如 `pnpm ex 02-exports`；`pnpm ex 04-tooling` 运行本章的全部练习

## 章末项目：@learn-ts/agent-kit

把第 2、3 章的成果整理进 [packages/agent-kit](../../packages/agent-kit/)：设计公开接口、配置 `exports`（主入口、测试工具入口、开发时直接使用源码的条件）、用 `tsc` 构建、接入 pnpm 工作区。然后实现一个发布前检查：用 `npm pack` 拿到真正会发布的文件，用练习 4-3 的规则检查 `package.json`，再把包解压到一个全新的临时项目里，像真实用户一样做类型检查和运行。演示程序用这个包完成一次完整的"模型调用工具 → 执行 → 交回结果"的回合，这正是第 6 章 agent 主循环的雏形。

## 自测清单

1. Node 怎么决定一个 `.js` 文件是 ESM 还是 CommonJS？`.mts`、`.cts` 呢？为什么 TypeScript 要求在相对导入里写上扩展名？
2. `exports` 里条件的顺序为什么重要？为什么 `types` 要写在 `default` 前面？自定义条件解决了什么问题？
3. 一个只有 `main` 没有 `exports` 的包，和有 `exports` 的包，使用者能导入的范围有什么不同？
4. `isolatedDeclarations` 要求你做什么？它带来了什么好处？
5. `declare module "x" { ... }` 在什么情况下是声明一个新模块，什么情况下是扩充已有的模块？
6. 举两个 `tsc` 发现不了、但类型感知的 ESLint 能发现的 bug
7. 假对象（fake）、桩（stub）、间谍（spy）分别是什么？为什么第 3 章的客户端几乎不需要 `vi.mock`？
8. 工作区里的包 A 依赖包 B，`workspace:*` 在发布时会变成什么？为什么开发时可以不先构建 B？
9. 一段代码偶尔很慢，你会先用什么方法定位？`performance.now()` 和 CPU profile 各适合回答什么问题？
10. 为什么仓库里的测试全部通过，发布出去的包仍然可能坏掉？发布前检查要检查哪些东西？

## 下一章

[第 5 章：Schema 与运行时校验](../05-validation/README.md)。用 Zod 描述工具参数和模型输出，从同一份 schema 得到 TypeScript 类型、JSON Schema 和运行时校验，替换掉第 2 章手写的迷你 schema 和第 3 章 `parseChunk` 里的 `as`。
