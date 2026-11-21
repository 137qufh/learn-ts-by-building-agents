# 4.5 ESLint：类型感知的代码检查

> 这一节要解决的问题：第 3 章反复强调"Promise 一定要有人 await"，可 `tsc` 并不检查这件事：忘了写 `await` 的代码照样通过类型检查，bug 留到运行时才出现。还有 `forEach(async ...)`、把对象塞进模板字符串……这些"类型上没错、逻辑上错了"的写法，谁来发现？

示例代码：[examples/05-linting.ts](examples/05-linting.ts)

## 三个工具，三种职责

| 工具     | 回答的问题                | 例子                                                                |
| -------- | ------------------------- | ------------------------------------------------------------------- |
| `tsc`    | 类型对不对？              | 把 `string` 传给了 `number` 参数                                    |
| ESLint   | 有没有容易出 bug 的写法？ | Promise 没人处理；`switch` 漏了一个分支                             |
| Prettier | 格式统一吗？              | 缩进、引号、换行（[0.1 节](../00-setup/01-node-and-pnpm.md)就在用） |

三者互不替代。特别是 **不要用 ESLint 管格式**：格式是 Prettier 的事，它直接帮你改好，不需要讨论。ESLint 只管那些"可能是 bug"的东西。

本仓库的 `pnpm check` 现在包含了 `pnpm lint`：类型检查、格式检查、lint、测试，四关都过才算通过。

## 只看语法 vs 类型感知

ESLint 本身只懂 JavaScript。[typescript-eslint](https://typescript-eslint.io) 让它能读懂 TypeScript，并且提供了一批规则。这些规则分两类：

- **只看语法的规则**：只分析代码的结构。快，但不知道任何表达式的类型
- **类型感知的规则**：通过 TypeScript 拿到每个表达式的类型再做判断。慢一些（需要先做一遍类型分析），但能发现真正的 bug

示例代码拿两套配置检查同一个文件 [specimens/async-bugs.ts](examples/specimens/async-bugs.ts)：

```ts
export async function saveAll(store: Store, items: string[]): Promise<void> {
  items.forEach(async (item) => {
    await store.save(item);
  });
}

export function log(store: Store, value: { id: number }): void {
  store.save(`保存了 ${value}`);
}
```

```text
── 只看语法：0 条 ──
── 类型感知：6 条 ──
  第 8 行  @typescript-eslint/require-await
  第 9 行  @typescript-eslint/no-misused-promises
  第 15 行  @typescript-eslint/no-floating-promises
  第 15 行  @typescript-eslint/no-base-to-string
  第 15 行  @typescript-eslint/restrict-template-expressions
  第 19 行  @typescript-eslint/await-thenable
```

只看语法的规则不知道 `store.save` 返回的是 Promise、`value` 是个对象，所以什么也发现不了。**TypeScript 项目一定要开启类型感知的规则**，它们才是 typescript-eslint 的价值所在。

## 配置文件

ESLint 的配置写在仓库根目录的 [`eslint.config.ts`](../../eslint.config.ts)。它是一个配置对象的数组（叫"扁平配置"，flat config），按顺序合并，后面的覆盖前面的：

```ts
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["**/dist/", "exercises/"] }, // 只有 ignores 的对象：全局忽略
  js.configs.recommended, // ESLint 自带的推荐规则
  tseslint.configs.recommendedTypeChecked, // typescript-eslint 推荐的规则，包括类型感知的
  {
    languageOptions: {
      parserOptions: {
        projectService: true, // 用离每个文件最近的 tsconfig.json 获取类型信息
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/switch-exhaustiveness-check": "error", // 额外开启的规则
    },
  },
  {
    files: ["chapters/**/examples/**/*.ts"], // 只对这些文件生效
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
```

几个要点：

- 每条规则的级别是 `"off"`、`"warn"` 或 `"error"`，可以带选项：`["error", { ... }]`。本仓库只用 `off` 和 `error`：警告最后总会被所有人忽略
- `files` 限定一个配置对象作用于哪些文件，用来给特殊的目录放宽或收紧规则
- typescript-eslint 提供几档预设：`recommendedTypeChecked`（推荐的起点）、`strictTypeChecked`（更严格，会有更多"有争议"的规则）、`stylisticTypeChecked`（代码风格，可选）
- 配置文件用 TypeScript 写，ESLint 需要 `jiti` 这个包来加载它（已经装在仓库里了）

## 最重要的几条规则

### Promise 相关（第 3 章的老朋友）

**`no-floating-promises`**：一个 Promise 被创建出来，却没有人 `await`、没有 `.then`/`.catch` 处理。它失败了没人知道（[3.3 节](../03-async/03-async-await.md)的"未处理的拒绝"），它完成之前函数可能已经返回了。修正办法：

```ts
await store.save(text); // 等它完成，错误会传给调用方
void store.save(text); // 明确表示"我知道，我就是不等"。仍然要确保它自己处理了错误
store.save(text).catch((error: unknown) => log(error)); // 不等，但处理错误
```

**`no-misused-promises`**：把 Promise 用在了不期望 Promise 的地方。最常见的是 `forEach(async ...)`（3.3 节）：`forEach` 不会等回调返回的 Promise，函数在任何一个回调完成之前就返回了。

**`await-thenable`**：`await` 了一个不是 Promise 的值。通常说明你以为某个函数是异步的，其实它不是。

### `any` 相关

**`no-unsafe-assignment`、`no-unsafe-member-access`、`no-unsafe-call`、`no-unsafe-return`、`no-unsafe-argument`**：[1.7 节](../01-basics/07-any-unknown-never.md)说过 `any` 会传染。`tsc` 允许你对 `any` 做任何事，这组规则不允许：`JSON.parse(text).name` 会被报告，逼你先把结果当 `unknown` 验证（1.7 节的做法）。`any` 从此只能停在它出现的那一行，不能扩散出去。

### 其他

- **`restrict-template-expressions`、`no-base-to-string`**：对象放进模板字符串或 `String()`，得到的是 `[object Object]`。日志里这种输出毫无用处
- **`switch-exhaustiveness-check`**：`switch` 一个联合类型，漏掉了某个成员。[1.6 节](../01-basics/06-unions-and-narrowing.md)用 `never` 做过穷尽性检查，这条规则自动帮你做，不在 recommended 里，本仓库额外开启了
- **`only-throw-error`、`prefer-promise-reject-errors`**：只抛出、只以 `Error` 拒绝（[3.4 节](../03-async/04-error-handling.md)）。`throw "超时"` 没有堆栈，`instanceof Error` 判断也会失败

## 本仓库的几个决定

[`eslint.config.ts`](../../eslint.config.ts) 里每个与默认不同的地方都写了注释，这里挑几个说明：

- **关掉了 `require-await`**：它要求 `async` 函数里必须有 `await`。但没有 `await` 的 `async` 函数仍然有意义：返回值一定是 Promise，同步抛出的异常也会变成拒绝。测试里的假实现（`async () => "回复"`）大量这样写。示例里的 `saveAll` 被它报告，只是 `forEach` 那个 bug 的一个症状
- **`exercises/` 不检查**：没做完的练习里到处是 `todo()` 和没用到的参数，必然违反规则。想检查自己的答案，运行 `pnpm exec eslint --no-ignore exercises/某个文件.ts`
- **示例代码放宽了一部分规则**：示例是"标本"，很多写法是故意的（演示 `any` 的危害、演示什么能通过编译）。但异步相关的规则仍然开启，示例里故意违反的地方逐行标注了原因
- **多余的禁用注释也算错误**（`reportUnusedDisableDirectives: "error"`）：代码改好了，当初的禁用注释要跟着删掉

## 禁用规则：写明是哪条、为什么

规则不是法律。确实需要违反时，在那一行上面写：

```ts
// eslint-disable-next-line @typescript-eslint/no-base-to-string -- 这里的 cause 一定是 Error 或字符串
```

三条纪律：

1. **只禁用一行**（`-next-line`），不要在文件开头禁用整个文件，除非整个文件都是同一种情况（比如 [3.1 节](../03-async/01-event-loop.md)的事件循环示例故意制造了一堆没人等的 Promise）
2. **写明规则名**：不写的话会禁用这一行的所有规则，把别的问题也藏起来
3. **`--` 后面写原因**：给下一个读代码的人（包括三个月后的你）

本节练习的测试会检查你没有用禁用注释"修"bug：报告背后是真的 bug，要改代码。

## TypeScript 7 和 ESLint

打开 `package.json`，你会看到一个奇怪的地方：

```json
{
  "devDependencies": {
    "typescript": "npm:@typescript/typescript6@^6.0.2",
    "typescript7": "npm:typescript@^7.0.2",
    "typescript-eslint": "^8.73.0"
  }
}
```

TypeScript 7 用 Go 重写了编译器，类型检查快了大约十倍。但 7.0 还没有提供 JavaScript API，而 typescript-eslint 这类工具正是通过这个 API 获取类型信息的（它目前要求 `typescript` 的版本 `<6.1.0`）。

所以在过渡期，官方推荐的做法是 **两个版本并存**，靠 npm 的别名功能（`"名字": "npm:真实包名@版本"`）：

- 名字叫 `typescript` 的包实际是 TypeScript 6，ESLint 等工具 `import "typescript"` 时拿到的是它，提供完整的 API。它还带一个 `tsc6` 命令
- 名字叫 `typescript7` 的包是真正的 TypeScript 7，提供 `tsc` 命令，`pnpm typecheck` 用的是它

TypeScript 6 和 7 的类型检查结果是一致的（6.0 就是为了和 7 对齐而发布的过渡版本），所以 ESLint 看到的类型和 `tsc` 看到的一样。等工具们支持了 TypeScript 7 的新 API，这个别名就可以去掉了。这类过渡期的配置在真实项目里很常见：写清楚原因，留下去掉它的条件。

## 编辑器

在 VS Code 里装上 ESLint 扩展（本仓库的 `.vscode/extensions.json` 已经推荐了），问题会直接以波浪线显示在代码里，比运行命令快得多。

## 小结

- `tsc` 管类型，Prettier 管格式，ESLint 管容易出 bug 的写法
- TypeScript 项目要用 typescript-eslint 的 **类型感知** 规则（`recommendedTypeChecked` + `projectService`），只看语法的规则发现不了真正的问题
- 最有价值的规则：`no-floating-promises`、`no-misused-promises`、`no-unsafe-*`、`restrict-template-expressions`、`switch-exhaustiveness-check`
- 规则级别只用 `off` 和 `error`；禁用时只禁一行、写明规则名和原因
- 过渡期用 npm 别名让 TypeScript 6（给工具用 API）和 TypeScript 7（`tsc`）并存

## 练习

[exercises/04-tooling/05-lint-fixes.ts](../../exercises/04-tooling/05-lint-fixes.ts)：一段能通过 `tsc` 的代码里藏着 6 个 bug，用 ESLint 找到它们并修好。运行 `pnpm ex 05-lint-fixes`。

下一节：[4.6 测试的模式](06-testing.md)
