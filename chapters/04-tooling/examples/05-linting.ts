// 4.5 ESLint：类型感知的代码检查
// 运行：pnpm tsx chapters/04-tooling/examples/05-linting.ts
//
// 用 ESLint 的 Node API，拿两套配置检查同一个文件 specimens/async-bugs.ts：
// 一套只看语法，一套还能用上类型信息。看看第二套多发现了什么。

import { ESLint, type Linter } from "eslint";
import tseslint from "typescript-eslint";

const specimen = "chapters/04-tooling/examples/specimens/async-bugs.ts";

async function lint(label: string, config: Linter.Config[]): Promise<void> {
  // overrideConfigFile: true 表示不读取仓库的 eslint.config.ts，只用这里给的配置
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: config, ignore: false });
  const [result] = await eslint.lintFiles([specimen]);
  console.log(`── ${label}：${result?.messages.length ?? 0} 条 ──`);
  for (const message of result?.messages ?? []) {
    console.log(`  第 ${message.line} 行  ${message.ruleId ?? ""}`);
  }
}

// 1. 只看语法：typescript-eslint 的 recommended 配置，不需要类型信息，速度快
await lint("只看语法", [...tseslint.configs.recommended]);
// ── 只看语法：0 条 ──

// 2. 类型感知：recommendedTypeChecked，ESLint 通过 TypeScript 拿到每个表达式的类型
await lint("类型感知", [
  ...tseslint.configs.recommendedTypeChecked,
  { languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: process.cwd() } } },
]);
// ── 类型感知：6 条 ──
//   第 8 行   require-await                  saveAll 是 async 函数，自己却从不 await（症状之一）
//   第 9 行   no-misused-promises            async 回调传给了 forEach，没人等它
//   第 15 行  no-floating-promises           save 返回的 Promise 没人处理
//   第 15 行  no-base-to-string              对象放进模板字符串，会得到 [object Object]
//   第 15 行  restrict-template-expressions  同上，这条规则只允许字符串、数字等类型出现在模板里
//   第 19 行  await-thenable                 await 了一个数字
//
// 只看语法的规则不知道 store.save 返回 Promise、value 是对象、n 是数字，所以一条也发现不了。
