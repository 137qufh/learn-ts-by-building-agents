# 4.4 声明文件

> 这一节要解决的问题：npm 上的包不都是用 TypeScript 写的。导入一个纯 JavaScript 的包时，TypeScript 从哪里知道它的类型？找不到时怎么办？上一节 `tsc` 生成的 `.d.ts` 到底是什么，能不能手写？怎么给别人的类型"加点东西"？

示例代码：[examples/04-declaration-files.ts](examples/04-declaration-files.ts)

## `.d.ts`：只有类型的文件

声明文件只描述"有什么、是什么类型"，不包含任何实现。上一节 `tsc` 为 `greet.ts` 生成的就是：

```ts
export interface GreetOptions {
  greeting?: string;
}
export declare function greet(name: string, options?: GreetOptions): string;
```

`declare` 的意思是"相信我，这个东西在运行时存在"。函数没有函数体，常量没有值。TypeScript 读到它，就知道 `greet` 的签名，而 `greet` 真正的代码在 `greet.js` 里。

其实你一直在用声明文件：

- `"lib": ["es2025"]` 让 TypeScript 加载它自带的 `lib.es2025.d.ts` 等文件，里面声明了 `Array`、`Promise`、`Map` 这些内置对象
- `"types": ["node"]` 加载 `node_modules/@types/node`，里面声明了 `process`、`Buffer` 和所有 `node:` 模块
- 每个用 TypeScript 写的包，发布时都带着 `tsc` 生成的 `.d.ts`

TypeScript **完全相信** 声明文件，不会拿它去和 JavaScript 实现对照。声明写错了，类型检查照样通过，错误留到运行时才出现。所以手写声明要格外小心，并且要像本节练习那样用类型测试和运行时测试一起验证。

## 找不到类型的时候

导入一个包，4.2 节讲过 TypeScript 按这个顺序找类型：包的 `exports` 里的 `types` 条件 → 和 `.js` 同名的 `.d.ts` → `node_modules/@types/包名`。都找不到时：

```text
error TS7016: Could not find a declaration file for module 'untyped'.
'/tmp/u/node_modules/untyped/index.js' implicitly has an 'any' type.
```

按推荐程度，有这几种办法：

**1. 安装社区写好的类型。** [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped) 仓库收集了几千个包的类型声明，以 `@types/包名` 的名字发布（作用域包 `@scope/name` 对应 `@types/scope__name`）。比如 `pnpm add -D @types/node`。注意 `@types` 包的版本最好和原包的主版本号一致。

**2. 自己写声明。** 给自己项目里的 JavaScript 文件写声明，放在旁边、取同样的名字：`legacy-math.js` 配 `legacy-math.d.ts`。导入 `./vendor/legacy-math.js` 时，TypeScript 自动找到它。示例代码的第 1 部分就是这样做的。

给 `node_modules` 里的包写声明，则用 **环境模块声明**（ambient module declaration），放在项目里任意一个被 `tsconfig` 包含的 `.d.ts` 文件中（常见的名字是 `types/untyped.d.ts`）：

```ts
declare module "untyped" {
  export function parse(text: string): Record<string, string>;
  export const version: string;
}
```

`declare module "包名"` 后面跟的是 **导入时写的那个说明符**，花括号里写这个模块的导出。

**3. 先让它通过，回头再补。** 只写一行：

```ts
declare module "untyped";
```

这叫简写的环境模块声明，这个包的所有导出都是 `any`。它是逃生舱，用了就等于放弃了这个包的类型检查（[1.7 节](../01-basics/07-any-unknown-never.md)讲过 `any` 会传染），只适合临时过渡。

## 写声明的规则

声明文件里能出现的东西：

```ts
export declare function round(value: number, digits?: number): number; // 函数：没有函数体
export declare const PRECISION: number; // 常量：没有值
export interface Stats {
  min: number;
  max: number;
  mean: number;
} // 类型和接口：和平时一样
export type Unit = "ms" | "s";

declare const legacyMath: { round: typeof round; stats: typeof stats };
export default legacyMath; // 默认导出：先声明，再导出
```

写的时候对照 JavaScript 源码，问自己几个问题：

- **参数可选吗？** `function round(value, digits = 2)` 的 `digits` 有默认值，所以是 `digits?: number`
- **返回值可能是 `null`/`undefined` 吗？** `stats([])` 返回 `null`，声明成 `Stats | null`，调用方才会被迫检查
- **参数会被修改吗？** 只读的数组参数写 `readonly number[]`，调用方可以放心传入只读数组
- **字符串其实只有几种取值吗？** 用字面量联合类型（[1.5 节](../01-basics/05-literal-types.md)），拼错的时候就能报错

## 脚本和模块

`.d.ts` 文件也分"脚本"和"模块"，区别在于 **有没有顶层的 `import` 或 `export`**：

- 没有：它是全局脚本，里面声明的所有东西都是全局的，任何文件都能直接用
- 有：它是模块，里面的声明只在导入它的地方可见

这是个常见的陷阱：一个全局声明文件本来好好的，你在顶部加了一行 `import type { X } from "./x.ts"`，它就变成了模块，里面声明的全局变量全都"消失"了。解决办法是用 `declare global` 把全局的部分包起来。

## `declare global`：声明全局变量

运行环境里本来就有、但 TypeScript 不知道的全局变量（比如某个运行时注入的变量），用 `declare global` 声明：

```ts
declare global {
  var __AGENT_DEBUG__: boolean | undefined;
}
```

只能用 `var`，因为只有 `var` 声明的全局变量才会成为 `globalThis` 的属性。`declare global` 只能写在模块里（有 `import`/`export` 的文件），本仓库开启了 `moduleDetection: "force"`，每个 `.ts` 文件都是模块，所以可以直接写。

全局声明影响整个项目：示例里声明了 `__AGENT_DEBUG__`，仓库里任何文件都能"看到"它，哪怕运行时它根本不存在。所以要克制：能用导入解决的，就不要声明全局变量。

## 模块扩充：给别人的接口加东西

TypeScript 的 `interface` 有一个特性叫 **声明合并**：同一个作用域里两个同名的 `interface` 会合并成一个。

```ts
interface Box {
  width: number;
}
interface Box {
  height: number;
}
const box: Box = { width: 1, height: 2 }; // 两个属性都要有
```

结合 `declare module`，就能往 **别的模块** 的接口里添加属性，这叫 **模块扩充**（module augmentation）。示例代码的第 2 部分：`vendor/event-bus.ts` 导出了一个空的 `Events` 接口，事件名和事件数据由使用者来扩充：

```ts
import { emit, on } from "./vendor/event-bus.ts";

declare module "./vendor/event-bus.ts" {
  interface Events {
    "tool:start": { tool: string; input: string };
    "tool:end": { tool: string; ms: number };
  }
}

emit("tool:end", { tool: "search", ms: 12 }); // ✓
emit("tool:end", { tool: "search" }); // ✗ 缺少 ms
```

`declare module` 后面的字符串必须和导入这个模块时写的说明符解析到同一个文件。很多库用这种方式留出扩展点，你一定会遇到：

```ts
// 给 Vitest 加一个自定义断言 expect(x).toBeValidToolCall()
declare module "vitest" {
  interface Matchers<T = any> {
    toBeValidToolCall(): T;
  }
}
```

注意只有 `interface` 能合并，`type` 别名不能：`type A = {...}` 写两次是重复声明的错误。这也是库作者用 `interface` 定义扩展点的原因。

## 几个相关的编译选项

| 选项           | 作用                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `types`        | 限定自动加载哪些 `@types` 包的全局声明。本仓库写的是 `["node"]`，别的 `@types` 包要显式导入才生效 |
| `lib`          | 加载哪些内置声明，比如 `es2025`；写前端代码时再加 `dom`                                           |
| `skipLibCheck` | 跳过对所有 `.d.ts` 文件的类型检查                                                                 |

`skipLibCheck: true` 几乎是所有项目的标配：`node_modules` 里不同包的声明文件之间偶尔会有冲突，这些错误你修不了，还拖慢检查速度。但它也会跳过 **你自己手写的** `.d.ts`，里面写错了也不会报错。所以手写的声明要靠测试来保证：用它的代码能通过类型检查，类型测试检查签名是否准确。库的作者还应该在一个真实的"用户项目"里检查生成的 `.d.ts`，章末项目会这样做。

## 小结

- `.d.ts` 只有类型没有实现；`declare` 表示"运行时存在"；TypeScript 完全相信它，所以写错了要靠测试发现
- 找类型的顺序：包自带 → `@types/包名` → 自己写的声明
- 本地 JavaScript 文件：旁边放同名 `.d.ts`；`node_modules` 里的包：`declare module "包名" { ... }`；`declare module "包名";` 是逃生舱
- 有顶层 `import`/`export` 的 `.d.ts` 是模块，全局声明要放进 `declare global`
- `interface` 会声明合并；`declare module` + `interface` 可以扩充别的模块的类型
- `skipLibCheck` 也会跳过你自己的 `.d.ts`

## 练习

[exercises/04-tooling/04-colors.ts](../../exercises/04-tooling/04-colors.ts)：给一个没有类型的终端颜色库 [vendor/ansi-lite.js](../../exercises/04-tooling/vendor/ansi-lite.js) 写出声明文件 `vendor/ansi-lite.d.ts`，再用它实现显示工具状态的函数。运行 `pnpm ex 04-colors`。

下一节：[4.5 ESLint：类型感知的代码检查](05-linting.md)
