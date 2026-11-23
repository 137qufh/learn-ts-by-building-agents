# 4.7 项目结构与 monorepo

> 这一节要解决的问题：harness 会越长越大：工具注册表、模型客户端、agent 循环、命令行界面、各种工具……全塞在一个目录里，很快就分不清谁依赖谁。代码该怎么组织？什么时候值得拆成多个包？多个包放在一个仓库里，怎么互相引用、怎么一起构建和测试？

示例代码：[examples/07-monorepo.ts](examples/07-monorepo.ts)

## 一个包内部的结构

先看单个包。一个典型的 TypeScript 库：

```text
agent-kit/
├── package.json
├── tsconfig.json          开发用：检查 src 和 test，不输出
├── tsconfig.build.json    构建用：只编译 src，输出到 dist
├── src/
│   ├── index.ts           公开接口：只做重新导出
│   ├── registry.ts
│   ├── client.ts
│   └── testing/
│       └── fake-openai.ts 给使用者写测试用的工具，单独一个入口
├── test/
│   └── agent-kit.test.ts
└── dist/                  构建产物，不提交到 git
```

几条经验：

- **`index.ts` 只做重新导出**，不写实现。它是包的目录，一眼就能看出公开了什么
- **测试放在 `src/` 之外**（或者用 `*.test.ts` 命名并在构建时排除），免得被编译、被发布（4.3 节）
- **按功能分文件，而不是按种类**：`registry.ts`、`client.ts`，而不是 `types.ts`、`utils.ts`、`constants.ts`。按种类分的话，改一个功能要同时动好几个文件，而 `utils.ts` 最后总会变成什么都往里扔的垃圾堆
- **依赖方向要单向**：`client.ts` 可以导入 `registry.ts` 的类型，反过来就不行。底层模块不知道上层模块的存在。出现循环导入（4.1 节）通常说明边界划错了

## 什么时候拆成多个包

一个仓库里放多个包，叫 **monorepo**。拆包有成本：每个包要有自己的 `package.json`、构建配置，包之间的接口一旦公开就要维护。值得拆的信号：

- **有不同的使用者**：`agent-kit` 被 harness 用，以后可能也被别的项目用；harness 的命令行界面只有 harness 自己用
- **有不同的依赖**：给浏览器用的部分不应该依赖 `node:fs`
- **想强制边界**：包与包之间只能通过 `exports` 里公开的接口交流（4.2 节）。同一个包里的模块可以随便互相导入，包之间不行。这是比"大家自觉"可靠得多的架构约束

本章的项目就是第一次拆包：把第 2 章的注册表和第 3 章的客户端拿出来，做成 `packages/agent-kit`，之后的 harness 通过包名 `@learn-ts/agent-kit` 使用它。

## pnpm 工作区

pnpm 的 **工作区**（workspace）功能让一个仓库管理多个包。根目录的 `pnpm-workspace.yaml` 列出包在哪里：

```yaml
packages:
  - "packages/*"
```

一个包依赖另一个包时，版本写成 `workspace:*`：

```json
{
  "devDependencies": {
    "@learn-ts/agent-kit": "workspace:*"
  }
}
```

`workspace:` 协议的意思是"用工作区里的那个包，不要去 npm 上下载"。`pnpm install` 会在依赖方的 `node_modules` 里建一个 **符号链接**，指向那个包的目录。示例代码手工搭了一个同样结构的仓库：

```text
packages/app/node_modules/@demo/core → packages/core
```

所以导入 `@demo/core` 时，Node 走的还是 4.2 节讲的标准流程：在 `node_modules` 里找到包，读它的 `exports`。工作区没有任何魔法，就是符号链接。（真的发布时，pnpm 会把 `workspace:*` 换成具体的版本号。）

### 严格的依赖

示例的第 3 部分展示了 pnpm 的一个重要特点：`app` 依赖 `core`，`core` 依赖 `utils`，但 `app` 自己 **没有声明** 依赖 `utils`，所以 `app` 里导入 `utils` 会失败：`ERR_MODULE_NOT_FOUND`。

npm 和 yarn 的传统做法是把所有依赖"提升"到根目录的 `node_modules`，这时 `app` 就能意外地导入 `utils`，这叫 **幽灵依赖**（phantom dependency）。它能正常运行，直到某天 `core` 不再依赖 `utils`，`app` 莫名其妙地坏了。pnpm 只给每个包链接它自己声明的依赖，这类问题在一开始就暴露出来。

### 常用命令

| 命令                                          | 作用                                                 |
| --------------------------------------------- | ---------------------------------------------------- |
| `pnpm install`                                | 安装所有包的依赖，建立工作区之间的链接               |
| `pnpm --filter @learn-ts/agent-kit build`     | 只在这个包里运行 `build` 脚本                        |
| `pnpm -r build`                               | 在所有包里运行 `build`，按依赖顺序（被依赖的先运行） |
| `pnpm --filter "...@learn-ts/agent-kit" test` | 这个包，以及所有依赖它的包                           |
| `pnpm --filter "...[origin/main]" test`       | 相对于 `main` 分支改动过的包，以及依赖它们的包       |
| `pnpm --filter @learn-ts/agent-kit add zod`   | 给某个包添加依赖                                     |

`-r` 的"按依赖顺序"和最后一种"受影响的包"，背后是图算法：拓扑排序，和沿着依赖关系反向查找。这正是本节的练习。

## 包之间的类型：两种做法

harness 导入 `@learn-ts/agent-kit` 时，TypeScript 去哪里找类型？按 4.2 节的规则，`types` 条件指向 `dist/index.d.ts`。这带来一个麻烦：**改了 agent-kit 的源码，必须先重新构建，harness 才能看到新的类型**。忘了构建，类型就是旧的；刚 clone 下来的仓库，`dist` 根本不存在，到处是红线。

有两种主流的解决办法。

**办法一：项目引用**（project references）。每个包的 `tsconfig.json` 开启 `composite`，依赖方用 `references` 指向被依赖的包，然后用 `tsc --build` 按依赖顺序增量构建：先构建被依赖的包，再检查依赖方。编辑器（语言服务）会把对 `dist/*.d.ts` 的引用映射回源码，所以在编辑器里改完不用等构建；命令行检查则依靠 `--build` 保证 `.d.ts` 是最新的。这是 TypeScript 官方的方案，适合大型仓库，代价是配置较多，而且必须构建。

**办法二：自定义源码条件**。4.2 节介绍过：在 `exports` 里加一个只在开发时启用的条件，指向源码：

```json
{
  "exports": {
    ".": {
      "@learn-ts/source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  }
}
```

然后在仓库里所有需要的地方启用这个条件：

| 谁             | 怎么启用                                       |
| -------------- | ---------------------------------------------- |
| `tsc` 和编辑器 | 根目录 `tsconfig.json` 的 `customConditions`   |
| Vitest         | `vitest.config.ts` 的 `ssr.resolve.conditions` |
| Node / tsx     | 命令行参数 `--conditions=@learn-ts/source`     |

这样仓库里的一切都直接使用源码：不需要构建，改了立刻生效，"跳转到定义"直接跳到 `.ts` 文件。而发布出去的包，用户的环境里没有这个条件，用的是 `dist`。本仓库用的是这种办法，配置少，也足够简单。

> 能直接运行 `src/index.ts`，靠的是 4.2 节说的那一点：Node 不剥离 `node_modules` 里的 `.ts`，但工作区的符号链接指向 `packages/`，真实路径不在 `node_modules` 里。

## 共享配置

多个包的 `tsconfig.json`、ESLint 规则往往大同小异。常见的做法是在根目录放一份基础配置，各包用 `extends` 继承：

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

本仓库目前只有一个包，`packages/agent-kit/tsconfig.json` 选择了自成一体（把选项完整写出来），这样这个包被单独拿出去也能构建。包多起来之后，再提取公共部分也不迟：**重复两次可以忍，第三次再抽象**。

## 小结

- 包内：`index.ts` 只做重新导出；按功能分文件；依赖方向单向；测试不进 `src` 的构建
- 拆包的理由：不同的使用者、不同的依赖、想强制边界
- pnpm 工作区 = `pnpm-workspace.yaml` + `workspace:*` 依赖 + 符号链接；pnpm 的严格链接杜绝幽灵依赖
- `--filter` 选择包，`-r` 按依赖顺序在所有包里运行
- 包之间的类型：项目引用（官方、需要构建），或者自定义源码条件（本仓库的做法，开发时直接用源码）

## 练习

[exercises/04-tooling/07-build-order.ts](../../exercises/04-tooling/07-build-order.ts)：实现 `pnpm -r` 背后的构建顺序（分批、检测循环依赖），以及"改了这些包，哪些包受影响"。运行 `pnpm ex 07-build-order`。

下一节：[4.8 调试与性能分析](08-debugging-and-profiling.md)
