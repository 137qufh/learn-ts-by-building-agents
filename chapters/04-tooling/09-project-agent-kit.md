# 4.9 章末项目：@learn-ts/agent-kit

> 这一节要解决的问题：第 2 章的工具注册表、第 3 章的模型客户端，现在散落在 `solutions/` 的好几个文件里，互相用 `../../` 引用。之后的 harness 要用它们，总不能也写 `import ... from "../../solutions/03-async/project/llm-client.ts"`。把它们做成一个真正的包：有清晰的公开接口、能构建出 `.js` 和 `.d.ts`、能被工作区里的其他代码按包名导入，也能（在理论上）发布给全世界。最后写一个发布前检查，像真正的用户一样验证它。

## 背景：从一堆文件到一个包

这一章的每一节都在为这一刻做准备：

| 要做的事                                       | 用到的知识 |
| ---------------------------------------------- | ---------- |
| 把文件整理进 `packages/agent-kit/src`          | 4.1、4.7   |
| 设计公开接口（`index.ts`），隐藏内部实现       | 4.3、4.7   |
| `exports`：主入口、测试工具入口、源码条件      | 4.2        |
| 构建出 `.js`、`.d.ts` 和 map 文件              | 4.3        |
| 工作区：根目录用 `workspace:*` 依赖它          | 4.7        |
| 开发时直接用源码：`tsc`、Vitest、Node 都要配置 | 4.2、4.7   |
| 用 lint 和测试守住质量                         | 4.5、4.6   |
| 发布前检查：打包文件、`package.json`、真实安装 | 4.3、4.4   |

包已经搭好了，就在 [packages/agent-kit](../../packages/agent-kit/)。这一节先带你逐个文件读一遍它，再完成项目练习：发布前检查脚本。

## 走读：packages/agent-kit

### 目录

```text
packages/agent-kit/
├── package.json
├── tsconfig.json           开发：检查 src 和 test，不输出
├── tsconfig.build.json     构建：编译 src 到 dist
├── src/
│   ├── index.ts            公开接口
│   ├── registry.ts         第 2 章项目：工具注册表
│   ├── client.ts           第 3 章项目：流式客户端
│   ├── errors.ts  abort.ts  retry.ts  streams.ts  sse.ts  usage.ts
│   └── testing/
│       └── fake-openai.ts  假的模型服务器，给使用者写测试用
└── test/
    └── agent-kit.test.ts
```

`src/` 里的文件就是 `solutions/` 里对应的参考答案，只改了导入路径：原来的 `../04-api-errors.ts` 变成了 `./errors.ts`。按功能命名（`retry.ts`），而不是按练习编号（`07-retry.ts`）。

> 注意：`packages/agent-kit/src` 里有第 2、3 章的完整参考实现。如果你还没做完那两章的练习，先做完再来读。

### 公开接口：`src/index.ts`

[`index.ts`](../../packages/agent-kit/src/index.ts) 只有重新导出，每一行都是一个决定：

```ts
export {
  createClient,
  type CallOptions,
  type ChatRequest,
  // ……
} from "./client.ts";
```

`client.ts` 里还导出了 `parseChunk`、`buildRequest`、`createToolCallAccumulator`。它们在第 3 章是练习的一部分，需要单独测试，所以导出了；但对使用者来说它们是 **实现细节**，`index.ts` 没有重新导出它们。将来想重写流解析的方式，不会影响任何使用者。

包自己的测试 [test/agent-kit.test.ts](../../packages/agent-kit/test/agent-kit.test.ts) 第一个用例就是把公开的名字全部列出来：

```ts
expect(Object.keys(kit).sort()).toEqual(["ApiError", "abortableSleep" /* …… */]);
```

这样，任何人增加或删除一个公开的名字，这个测试都会失败，提醒他：这是一个影响使用者的决定，要考虑版本号（4.3 节）。

### `package.json`

```json
{
  "name": "@learn-ts/agent-kit",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "@learn-ts/source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./testing": {
      "@learn-ts/source": "./src/testing/fake-openai.ts",
      "types": "./dist/testing/fake-openai.d.ts",
      "default": "./dist/testing/fake-openai.js"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "src"],
  "engines": { "node": ">=22.12" },
  "sideEffects": false,
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc",
    "prepack": "pnpm run build"
  }
}
```

几个值得注意的地方：

- **`"private": true`**：防止误发布。它不影响工作区内的使用，也不影响 `npm pack`。真要发布时，删掉这一行即可
- **两个入口**：`.` 是主入口；`./testing` 是给使用者写测试用的假服务器。分开的原因是它不应该出现在生产代码的导入里：harness 的测试会写 `import { createFakeOpenAI } from "@learn-ts/agent-kit/testing"`，一眼就能看出这是测试工具
- **源码条件写在 `types` 前面**：开启时它优先，类型和代码都来自源码（4.2 节）
- **`files` 里有 `src`**：配合 declaration map，使用者"跳转到定义"能直接看到源码。测试在 `test/` 目录，不会被带上
- **只发布 ESM**，`engines` 写的是能 `require(esm)` 的最低版本（4.3 节）

### 两份 tsconfig

[`tsconfig.json`](../../packages/agent-kit/tsconfig.json) 是开发用的，选项和仓库根目录基本一样，多了两项：

- `isolatedDeclarations`（连同它要求的 `declaration`）：公开的东西必须写明类型。放在开发配置里，编辑器里马上就能看到红线，不用等到构建
- `customConditions: ["@learn-ts/source"]`：包自己的测试用包名导入自己（`import ... from "@learn-ts/agent-kit"`，这叫 **自引用**，`exports` 让它成为可能），这个条件让它指向源码

[`tsconfig.build.json`](../../packages/agent-kit/tsconfig.build.json) 继承开发配置，打开输出：

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "allowImportingTsExtensions": false,
    "rewriteRelativeImportExtensions": true,
    "rootDir": "src",
    "outDir": "dist",
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

构建：

```bash
pnpm --filter @learn-ts/agent-kit build
```

TypeScript 7 编译整个包只需要零点几秒。`dist/` 在 `.gitignore` 里，不提交。

### 接入工作区

根目录做了四处改动：

1. [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) 加上 `packages: ["packages/*"]`
2. 根目录 `package.json` 的开发依赖加上 `"@learn-ts/agent-kit": "workspace:*"`，`pnpm install` 后，`node_modules/@learn-ts/agent-kit` 是指向 `packages/agent-kit` 的符号链接
3. 根目录 [`tsconfig.json`](../../tsconfig.json) 加上 `customConditions: ["@learn-ts/source"]`，并且排除 `**/dist`（否则构建出的 `.d.ts` 会被当成源码再检查一遍）
4. [`vitest.config.ts`](../../vitest.config.ts) 加上 `ssr.resolve.conditions`

于是仓库里任何地方都可以写：

```ts
import { createClient, createRegistry, defineTool } from "@learn-ts/agent-kit";
```

`tsc`、编辑器、Vitest 看到的都是 `src/` 下的源码，不需要先构建。用 Node 或 tsx 运行时，记得加上 `--conditions=@learn-ts/source`；不加的话，加载的是 `dist/`，需要先构建。

## 项目练习：发布前检查

包能被仓库里的代码导入，不代表它作为一个包是合格的。仓库里的一切都走源码条件，**没有人真正用过 `dist/`**：`exports` 指向的文件可能没被打包，`.d.ts` 可能有问题，编译出的 `.js` 可能根本跑不起来（比如漏了一个文件）。

题目在 [exercises/04-tooling/project/release-check.ts](../../exercises/04-tooling/project/release-check.ts)，分四步：

1. **`packedFiles`**：调用 `npm pack --dry-run --json`，拿到会被打包的文件列表
2. **`checkManifest`**：用你在练习 4-3 写的 `lintPackage`，检查 `package.json` 和文件列表
3. **`smokeTest`**：真的打包出一个 `.tgz`，解压到一个全新的临时项目的 `node_modules` 里，在那个项目里写一段使用代码，运行 `tsc` 和 `node`。这个项目里没有任何自定义条件，拿到的是 `dist/` 里的东西，和真实用户完全一样
4. **`releaseCheck`**：把上面的结果汇总成一份问题清单

运行命令用的 `run` 函数、`tsc` 的路径等辅助代码已经写好了。

这种测试叫 **冒烟测试**（smoke test）：不追求覆盖所有细节（那是单元测试的事），只验证"装上之后能不能用"这个最基本的问题。名字来自硬件：新电路板第一次通电，先看看会不会冒烟。

测试会对 `packages/agent-kit` 运行你的检查，期望没有问题；还会造一个有问题的包（`exports` 条件顺序错了、`.d.ts` 和实现对不上、`index.js` 引用了一个不存在的文件），期望你的检查把问题全部报告出来。

```bash
pnpm ex release-check
```

## 提示

### `npm pack` 的输出

`--json` 让 `npm pack` 输出结构化的结果，比解析文字可靠得多：

```json
[
  {
    "filename": "learn-ts-agent-kit-0.1.0.tgz",
    "files": [{ "path": "dist/index.js", "size": 1234 }]
  }
]
```

作用域包的文件名里，`@` 被去掉，`/` 换成了 `-`。不要自己拼文件名，用输出里的 `filename`。

### 类型错误和运行失败要同时报告

`smokeTest` 里 `tsc` 报错了，不要立刻返回，`node` 照样要运行：类型错误和运行时错误往往是不同的问题，一次全部报告出来，省得改一个、跑一次、再改一个。只有"检查本身没法进行"（打包失败、解压失败）才抛出异常。这和 [3.4 节](../03-async/04-error-handling.md)讲的"预料之中的失败用返回值表达"是一回事。

### 临时目录一定要清理

用 `try/finally` 删除临时目录，无论成功还是失败。测试会运行很多次，泄漏的临时目录会慢慢塞满磁盘。

## 运行演示

```bash
pnpm tsx --conditions=@learn-ts/source chapters/04-tooling/project/demo.ts
```

[演示](project/demo.ts) 的第一部分像 harness 一样使用这个包：注册一个工具，让（假的）模型调用它，把结果交回模型，拿到最终回答。这正是第 6 章 agent 主循环的雏形。第二部分构建这个包，并运行你的发布前检查：

```text
@learn-ts/agent-kit 加载自：file:///…/packages/agent-kit/src/index.ts

> 北京今天天气怎么样？
模型：我查一下。
[调用 get_weather({"city":"北京"}) → 北京：晴，25°C]
模型：北京今天晴，25°C，适合出门。

── 发布前检查 ──
✓ 没有发现问题，可以发布
```

试着去掉 `--conditions=@learn-ts/source` 再运行一次，看第一行的变化。再试着故意弄坏 `packages/agent-kit/package.json`（比如把 `types` 挪到 `default` 后面），看你的检查能不能发现。

## 做完之后

对照 [参考答案](../../solutions/04-tooling/project/release-check.ts)，然后想一想：

1. 为什么 `smokeTest` 要真的打包、解压，而不是直接在临时项目里建一个指向 `packages/agent-kit` 的符号链接？哪些问题只有打包才能发现？
2. 冒烟测试里的 `tsc` 没有开 `skipLibCheck`，包里的哪些 `.d.ts` 会被检查？演示里的使用代码只用到了注册表，如果 `createClient` 的 `.d.ts` 和实现对不上（比如声明说返回的对象有 `close` 方法，实际没有），能被发现吗？怎么改进？
3. 现在 `@learn-ts/agent-kit` 的版本是 `0.1.0`。如果给 `createClient` 的选项加一个可选属性，版本应该变成多少？把 `ChatResult.toolCalls` 改名呢？
4. 把发布前检查加进 CI，应该在什么时机运行？每次提交，还是只在发布时？

## 和后面章节的关系

- **第 5 章** 用 Zod 给工具参数加上运行时校验，作为新的入口 `@learn-ts/agent-kit/zod` 发布 0.2.0（5.7 节）；练习 5-6 把 `parseChunk` 里的 `as` 换成了 schema
- **第 6 章** 起，harness 作为工作区里的另一个包，用 `workspace:*` 依赖 `@learn-ts/agent-kit`，它的测试用 `@learn-ts/agent-kit/testing` 里的假服务器

## 小结

- 一个包 = 清晰的公开接口（`index.ts` + `exports`） + 构建配置 + 测试；内部实现不导出
- 工作区让仓库里的代码按包名导入它；源码条件让开发时不需要构建
- 仓库内部一切正常，不代表发布出去的包正常：要像真正的用户一样，打包、安装、类型检查、运行
- 公开接口的变化要有测试守着，因为它决定了版本号
