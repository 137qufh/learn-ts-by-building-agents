# 0.1 安装 Node.js 和 pnpm，跑起这个仓库

> 这一节要解决的问题：在你的电脑上把这个仓库跑起来，并完成第一道练习。

## 为什么需要 Node.js

TypeScript 本身不能运行。它是"JavaScript + 类型标注"，运行之前类型会被去掉，剩下的 JavaScript 交给一个 **JavaScript 运行时** 执行。

- 浏览器是一种运行时（跑网页里的 JS）
- **Node.js** 是另一种运行时，让 JS 能在你的电脑、服务器、命令行里运行

Agent harness 通常跑在服务器或终端里：调用模型 API、读写文件、执行命令。所以本课程全程使用 Node.js。如果你写过 Python，可以把 Node.js 类比成 `python` 解释器，把 npm 上的包类比成 PyPI 上的包。

## 安装 Node.js（24 或更新）

本仓库要求 **Node.js 24 及以上**，推荐使用当前的 LTS 版本（长期支持版）。

推荐用版本管理器 [fnm](https://github.com/Schniz/fnm) 安装，以后切换版本只需一条命令：

```bash
# macOS
brew install fnm
# Linux
curl -fsSL https://fnm.vercel.app/install | bash
# Windows
winget install Schniz.fnm
```

用 Homebrew 或 winget 安装后，还需要按 fnm 文档里的 [Shell setup](https://github.com/Schniz/fnm#shell-setup) 把它接入你的 shell（Linux 的安装脚本会自动做这一步）。然后：

```bash
fnm install --lts   # 安装最新的 LTS 版本
node --version      # 应该输出 v24.x 或更高
```

> 不想用版本管理器？直接从 [nodejs.org](https://nodejs.org/) 下载 LTS 安装包也完全可以。
>
> 仓库根目录有一个 `.node-version` 文件。如果你按 fnm 文档开启了 `--use-on-cd`，进入目录时它会自动切换到合适的版本。

## 安装 pnpm

Node.js 自带的包管理器是 npm。本仓库使用 [pnpm](https://pnpm.io/)，原因有两个：

1. **快，而且省空间**：同一个版本的包在你电脑上只存一份，多个项目共享
2. **更严格**：你只能 `import` 自己在 `package.json` 里声明过的包。npm 会把依赖的依赖"拍平"到 `node_modules` 顶层，让你不小心用上一个没声明的包（俗称"幽灵依赖"），换台机器就可能坏掉；pnpm 不允许这样

安装：

```bash
npm install -g pnpm@latest
pnpm --version
```

> 也可以用官方的独立安装脚本，见 [pnpm 安装文档](https://pnpm.io/installation)。

## 克隆并安装依赖

```bash
git clone https://github.com/137qufh/learn-ts-by-building-agents.git
cd learn-ts-by-building-agents
pnpm install
```

`pnpm install` 会读取 `package.json` 里的依赖列表，按 `pnpm-lock.yaml`（锁文件，记录了每个包的精确版本）安装到 `node_modules/`。锁文件保证了你和我、和 CI 装到的是完全一样的版本。

装完后，看一眼 `package.json` 里的开发依赖：

| 包            | 作用                                         |
| ------------- | -------------------------------------------- |
| `typescript`  | 提供 `tsc` 命令：类型检查器                  |
| `tsx`         | 直接运行 `.ts` 文件的工具（下一节详细讲）    |
| `vitest`      | 测试框架，所有练习都靠它判断对错             |
| `prettier`    | 代码格式化工具，保证大家的代码风格一致       |
| `@types/node` | Node.js 内置 API（`process`、`fs` 等）的类型 |

## 仓库导览

```
chapters/     每章的讲解（.md）和可运行示例（examples/）
exercises/    练习题：你要动手改的地方
solutions/    参考答案：做完再看
tests/        仓库自检（确保示例能跑、每道题都有答案）
docs/         写作约定
```

## 运行第一个示例

```bash
pnpm tsx chapters/00-setup/examples/01-hello.ts
```

`pnpm tsx` 的意思是"运行本项目安装的 `tsx` 命令"。你应该看到：

```
Hello, Ada!
Hello, Linus!
Hello, Grace!
Hello, 42!
```

最后一行有点奇怪：示例里故意给只接受字符串的函数传了数字 `42`。打开 [examples/01-hello.ts](examples/01-hello.ts) 看看，那一行上方有一条 `// @ts-expect-error` 注释，意思是"下一行有一个故意的类型错误"。删掉这条注释，编辑器就会把下一行标红。可是程序依然照常运行了。为什么？这正是下一节的主题。

## 做第一道练习

本仓库的练习都是"测试驱动"的：**测试已经写好，你写代码让它通过**。

1. 在终端运行：

   ```bash
   pnpm ex 00-setup
   ```

   `pnpm ex` 会以监听模式启动 Vitest，只运行练习测试；后面的 `00-setup` 是过滤条件，只跑这一章。你会看到大片红色：练习还没做，测试当然失败（个别测试可能碰巧是绿的）。按 `q` 退出监听模式。

2. 打开 [exercises/00-setup/01-hello.ts](../../exercises/00-setup/01-hello.ts)，读题目注释，再读旁边的测试文件 `01-hello.test.ts`：测试就是最精确的题目描述。

3. 把 `todo()` 换成你的实现，保存。终端里的测试会自动重跑，红色变绿色就完成了。

4. 卡住了？参考答案在 [solutions/00-setup/01-hello.ts](../../solutions/00-setup/01-hello.ts)。先自己试 10 分钟再看，收获会大很多。

> **`pnpm ex` 和 `pnpm test` 的区别**
>
> - `pnpm ex`：学习者用。测试导入的是 **你** 在 `exercises/` 里写的代码
> - `pnpm test`：维护者和 CI 用。跑全部测试，并把练习测试的导入换成 `solutions/` 里的参考答案，用来证明"题目、答案、测试"三者一致
>
> 刚克隆下来时，`pnpm test` 是全绿的，`pnpm ex` 是全红的。这是正常的。

## 小结

- TS 不能直接运行，要先去掉类型变成 JS，再交给 Node.js 这样的运行时执行
- 本仓库需要 Node.js 24+ 和 pnpm；`pnpm install` 按锁文件安装出完全一致的依赖
- `pnpm tsx 文件.ts` 运行示例，`pnpm ex` 做练习

下一节：[0.2 TS 代码是怎么跑起来的](02-running-ts.md)
