# 4.6 测试的模式

> 这一节要解决的问题：从第 0 章开始，你每天都在和测试打交道，不过一直是在"让别人写的测试变绿"。自己写测试时，问题就来了：代码要调用模型 API，测试里怎么办？要等 1 秒再重试，测试也要等 1 秒吗？`vi.fn()`、`vi.mock()`、假定时器……该用哪个？怎么让测试既可靠又不脆弱？

示例代码：[examples/testing/summarize.test.ts](examples/testing/summarize.test.ts)（被测试的函数在 [summarize.ts](examples/testing/summarize.ts)；运行 `pnpm test chapters/04-tooling/examples/testing`）

## 好测试的标准

先说目标。一个好的测试：

- **快**：几毫秒跑完。慢的测试没人愿意跑
- **确定**：每次运行结果都一样。时而红时而绿的测试（flaky test）比没有测试还糟，因为大家会学会无视它
- **只在行为改变时失败**：重构了内部实现、行为没变，测试就不该红。这样的测试才能保护重构，而不是阻碍重构
- **失败时说清楚哪里错了**：`expected "完成" but got ""`，比 `expected true but got false` 有用得多

让测试变慢、变得不确定的，几乎总是同几样东西：**网络、时间、随机数、文件系统、全局状态**。这一节的大部分内容，就是怎么在测试里替换掉它们。

## 依赖注入：可测试性的根本

示例里要测试的函数 `summarize` 会调用模型、读写缓存、在失败时等 1 秒再重试。它的签名是这样的：

```ts
export interface SummarizeDeps {
  llm: Llm;
  cache: Cache;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export async function summarize(input: string, deps: SummarizeDeps): Promise<Summary>;
```

所有"外部世界"都从参数传进来，这就是 **依赖注入**。生产代码传入真的模型客户端，测试传入假的。第 3 章的 `retry`（`sleep` 参数）、项目里的模型客户端（`fetch` 参数）都是这么设计的。

依赖注入不需要任何框架，就是"把依赖作为参数"。它的好处不只是方便测试：函数的签名诚实地写出了它依赖什么，读代码的人一眼就能看到"这个函数会访问网络"。

## 测试替身的分类

替换真实依赖的东西统称 **测试替身**（test double），按用途可以分成几种：

| 种类             | 是什么                                 | 例子                                           |
| ---------------- | -------------------------------------- | ---------------------------------------------- |
| 桩（stub）       | 返回预设的值，不关心怎么被调用         | 一个总是返回 `"一句话总结"` 的 `complete`      |
| 间谍（spy）      | 记录自己被怎么调用了                   | 检查 `complete` 被调用了一次，参数是什么       |
| 伪造对象（fake） | 一个真的能用、但简化了的实现           | 用 `Map` 实现的内存缓存；第 3 章的假模型服务器 |
| 模拟对象（mock） | 预先设定"应该被怎样调用"，不符合就失败 | `vi.mock` 替换整个模块                         |

Vitest 的 `vi.fn()` 同时是桩和间谍：

```ts
const complete = vi.fn<Llm["complete"]>().mockResolvedValue("一句话总结");
await summarize("很长的文字", { llm: { complete }, cache });

expect(complete).toHaveBeenCalledTimes(1);
expect(complete).toHaveBeenCalledWith("用一句话总结：很长的文字");
```

`vi.fn<Llm["complete"]>()` 的类型参数让这个假函数有准确的签名：`mockResolvedValue(42)` 会是类型错误。不写类型参数的话，它接受任何参数、返回 `any`，替身和真实接口不一致时你不会知道。

### 优先用伪造对象

对比这两种检查"结果被存进了缓存"的方式：

```ts
// 用间谍：检查 set 被以特定参数调用了
expect(cache.set).toHaveBeenCalledWith("summary:很长的文字", "一句话总结");

// 用伪造对象：检查缓存里真的有了这个值
expect(cache.data.get("summary:很长的文字")).toBe("一句话总结");
```

第一种测试的是 **实现**：哪天你把两次 `set` 合并成一次 `setMany`，测试就红了，尽管行为完全没变。第二种测试的是 **结果**，只要最终缓存里有这个值就通过。

所以经验是：**对你自己控制的接口（缓存、存储、工具注册表），写一个伪造对象**；它写一次，所有测试都能用，而且让测试读起来就像在用真的东西。间谍适合检查"确实调用了 / 确实没调用"这类本身就是行为的事情，比如"缓存命中时不调用模型"。

### `vi.mock`：最后的手段

Vitest 还能替换整个模块：

```ts
vi.mock("./llm-client.ts", () => ({ complete: vi.fn() }));
```

`vi.mock` 会被提升到文件最顶部执行（在所有 `import` 之前），之后任何地方导入 `./llm-client.ts`，拿到的都是假的。它能用在无法注入依赖的代码上，但代价不小：

- 隐式：读被测代码看不出它会被替换，读测试也要知道提升这个特殊规则
- 脆弱：和模块路径、导入方式绑定，文件一挪就失效
- 类型不安全：工厂函数返回什么都行，和真模块对不上也不会报错

本仓库的代码都设计成可以注入依赖，所以从来不需要 `vi.mock`。遇到第三方代码没法注入时，更好的办法通常是在它外面包一层你自己的接口，然后注入这个接口。

## 时间

第 3 章的重试、超时、退避都和时间有关。测试里不可能真的等，有两种办法。

**办法一：注入时钟。** 把 `now` 和 `sleep` 作为依赖。测试里的 `sleep` 立刻返回，同时把等待的时间记下来：

```ts
let clock = 0;
const sleeps: number[] = [];
const result = await summarize("文字", {
  llm: { complete },
  cache,
  now: () => clock,
  sleep: async (ms) => {
    sleeps.push(ms);
    clock += ms;
  },
});
expect(sleeps).toEqual([1000]);
```

**办法二：假定时器。** 代码直接用 `setTimeout` 和 `Date.now()`，测试用 `vi.useFakeTimers()` 把它们换成假的，再手动拨动时间：

```ts
vi.useFakeTimers();
const promise = summarize("文字", { llm: { complete }, cache });
await vi.advanceTimersByTimeAsync(999);
expect(complete).toHaveBeenCalledTimes(1); // 还在等
await vi.advanceTimersByTimeAsync(1);
expect(complete).toHaveBeenCalledTimes(2); // 1 秒到了，重试
vi.useRealTimers();
```

两个细节：一定要用带 `Async` 的版本（`advanceTimersByTimeAsync`），它在每个计时器之间让 Promise 有机会继续执行，否则 `await` 之后才调用的 `setTimeout` 永远等不到；测试结束一定要 `useRealTimers()`（放在 `finally` 或 `afterEach` 里），否则会影响后面的测试。

怎么选？**能注入就注入**。注入是显式的，测试读起来清楚，也不会和别的测试互相影响。假定时器适合测试已经写好、不方便改签名的代码。本节练习会自己实现一个假时钟，你会看到它一点都不神秘。

## 夹具：准备和清理

很多测试需要同样的准备工作（建一个空缓存、启动一个假服务器）。Vitest 的 `test.extend` 可以定义 **夹具**（fixture），测试用参数声明它需要什么：

```ts
const test = base.extend<{ cache: MemoryCache }>({
  // eslint-disable-next-line no-empty-pattern
  cache: async ({}, use) => {
    const cache = new MemoryCache(); // 准备
    await use(cache); // 测试在这里运行
    cache.data.clear(); // 清理
  },
});

test("缓存命中时不调用模型", async ({ cache }) => {
  // 每个测试拿到一份全新的 cache
});
```

和 `beforeEach` 相比，夹具的好处是：用到才创建，类型完整，清理代码和准备代码写在一起不会忘。第一个参数必须写成解构形式（哪怕是空的 `{}`），Vitest 靠它分析夹具之间的依赖，所以要禁用 ESLint 的 `no-empty-pattern`。

## 参数化测试

同一个逻辑、多组输入，用 `test.each` 或 `test.for`：

```ts
test.for([
  { input: "a", prompt: "用一句话总结：a" },
  { input: "多行\n文字", prompt: "用一句话总结：多行\n文字" },
])("提示词：$input", async ({ input, prompt }) => { ... });
```

标题里的 `$input` 会换成每组数据里的值。你在练习的测试里已经见过很多次 `test.each` 了。

## 快照

```ts
expect(complete.mock.calls).toMatchInlineSnapshot(`
  [
    [
      "用一句话总结：文字",
    ],
  ]
`);
```

第一次运行时，括号里是空的，Vitest 把实际的值写进测试文件；之后每次运行都和它比较。值变了，测试失败，你检查差异：是 bug 就修，是有意的改变就运行 `pnpm vitest -u` 更新快照。

快照适合检查 **又大又结构化、手写期望值很麻烦** 的输出，比如生成的提示词、格式化的报告。但不要滥用：快照太大时，没人会认真看差异，直接 `-u` 了事，测试就失去了意义。优先用内联快照（写在测试文件里），审查代码时能直接看到。

## 类型测试

第 2 章起你已经用过 `*.test-d.ts` 和 `expectTypeOf`：它们不运行，而是交给 `tsc` 检查。写库的时候（尤其是泛型很多的库），类型本身就是要测试的行为：

```ts
expectTypeOf(summarize).returns.resolves.toEqualTypeOf<{
  text: string;
  cached: boolean;
  ms: number;
}>();
```

`expectTypeOf` 也可以写在普通的 `.test.ts` 里，运行时什么也不做，由 `pnpm typecheck` 检查。`// @ts-expect-error` 用来断言"这一行必须报类型错误"：如果它不报错了（比如你不小心把类型放宽了），`tsc` 反而会报告"多余的 `@ts-expect-error`"。

## 覆盖率

`vitest run --coverage`（需要安装 `@vitest/coverage-v8`）会报告哪些代码行被测试执行过。它适合用来 **找出完全没被测试的地方**，比如一个从来没被触发过的错误分支。但不要把覆盖率数字当目标：100% 的覆盖率只说明每一行都执行过，不说明结果被检查过。

## 小结

- 好测试：快、确定、只在行为改变时失败、失败时说清楚原因
- 依赖注入是可测试性的根本：网络、时间、存储都从参数传入
- 自己控制的接口写伪造对象，检查结果而不是检查调用；`vi.fn<类型>()` 要写类型参数；`vi.mock` 是最后的手段
- 时间：优先注入 `now`/`sleep`；用假定时器时用 `advanceTimersByTimeAsync`，并且一定要恢复
- 夹具负责准备和清理；`test.each`/`test.for` 做参数化；快照用于大而结构化的输出
- 类型也是行为，用 `expectTypeOf` 和 `@ts-expect-error` 测试

## 练习

[exercises/04-tooling/06-test-doubles.ts](../../exercises/04-tooling/06-test-doubles.ts)：自己实现一个类型完整的间谍函数 `createSpy`，和一个假时钟 `createFakeClock`。运行 `pnpm ex 06-test-doubles`。

下一节：[4.7 项目结构与 monorepo](07-monorepo.md)
