# 参与贡献

谢谢你愿意让这门课变得更好！无论是修一个错别字、指出一处讲错的地方，还是补一道练习，都非常欢迎。

## 最有价值的贡献

1. **指出错误**：讲解中任何不准确的说法，都请开 issue，附上能复现的代码最好
2. **指出难懂的地方**：哪一段你读了三遍还没懂？告诉我们，这比什么都有用
3. **补充练习**：好的练习能让人"卡住一下再想通"，而不是照抄
4. **新章节**：请先开 issue 讨论范围，避免白费功夫

## 本地开发

需要 Node.js 24+ 和 pnpm（安装方法见[第 0 章](chapters/00-setup/01-node-and-pnpm.md)）。

```bash
git clone https://github.com/137qufh/learn-ts-by-building-agents.git
cd learn-ts-by-building-agents
pnpm install
pnpm check
```

| 命令             | 作用                                                           |
| ---------------- | -------------------------------------------------------------- |
| `pnpm typecheck` | 用 `tsc` 检查整个仓库的类型                                    |
| `pnpm test`      | 运行全部测试；练习测试会改用 `solutions/` 里的参考答案         |
| `pnpm ex`        | 学习者模式：只运行练习测试，用的是你自己在 `exercises/` 的代码 |
| `pnpm ex:types`  | 用 `tsc` 检查练习目录（包括类型测试），显示完整的错误信息      |
| `pnpm format`    | 用 Prettier 格式化                                             |
| `pnpm check`     | 提交前跑这个：typecheck + format:check + test                  |

## 写作约定

- 章节结构、文件命名、练习格式见 [docs/chapter-template.md](docs/chapter-template.md)
- 正文用中文；代码里的标识符用英文，注释中英文都可以，以清楚为准
- 中文与英文、数字之间加空格（例如"用 TypeScript 写 agent"）
- 解释"为什么"，而不只是"是什么"
- 一个说法如果能用代码验证，就放进示例里让 CI 去验证

## 提交 PR

- 一个 PR 只做一件事，标题说清楚改了什么
- 确保 `pnpm check` 在本地通过；CI 会在 Node 24 和 26 上再跑一遍
- 修改练习时，题目、测试、参考答案三者要一起改
