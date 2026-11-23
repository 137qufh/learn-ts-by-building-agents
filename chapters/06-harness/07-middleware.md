# 6.7 钩子与中间件

> 这一节要解决的问题：写文件之前要问用户同不同意；每次调用模型之前要加上当前时间；工具的结果里有手机号要打码；花费超过一块钱就停下……这些需求五花八门，而且每个使用 harness 的人需要的都不一样。全写进主循环，主循环会变成一团乱麻。怎么让使用者从外面"插"进来？

示例代码：[examples/07-middleware.ts](examples/07-middleware.ts)

## 插入点

先找出主循环里 **值得插入** 的位置。不是越多越好：每个插入点都是对使用者的承诺（4.3 节：公开的东西改不得），太多了 harness 就没法再修改自己的内部实现。这一章选了三个：

| 插入点         | 时机                   | 能做什么                                   | 例子                                 |
| -------------- | ---------------------- | ------------------------------------------ | ------------------------------------ |
| `beforeModel`  | 每次调用模型之前       | 修改请求                                   | 动态的系统提示、换模型参数、注入记忆 |
| `wrapToolCall` | 包住每一次工具调用     | 在执行前后做事、修改参数或结果、拦下不执行 | 权限确认、日志、脱敏、缓存、计时     |
| `afterStep`    | 每一步的工具执行完之后 | 让循环停下                                 | 预算控制、"完成条件"检查             |

```ts
interface AgentMiddleware {
  name: string;
  beforeModel?: (
    request: ChatRequest,
    info: StepInfo,
  ) => ChatRequest | undefined | Promise<ChatRequest | undefined>;
  wrapToolCall?: Wrapper<ToolInvocation, ToolOutcome>;
  afterStep?: (
    info: StepInfo,
  ) => { stop: string } | undefined | Promise<{ stop: string } | undefined>;
}
```

一个中间件是一个对象，三个方法都是可选的：只关心工具的中间件只写 `wrapToolCall`。返回类型都允许 `Promise`，因为"问用户同不同意"、"查一下数据库"都是异步的。

`beforeModel` 和 `afterStep` 是 **钩子**（hook）：在某个时刻被调用一下，返回一个值。`wrapToolCall` 是 **包装**（wrapper）：它包在工具调用外面，自己决定什么时候、要不要调用里面的东西。后者强大得多，下面细说。

## 洋葱模型

```ts
type Next<A, R> = (input: A) => Promise<R>;
type Wrapper<A, R> = (input: A, next: Next<A, R>) => Promise<R>;
```

包装拿到输入和一个 `next`：调用 `next(input)` 就是"交给里面那一层处理"。多个包装一层套一层，最里面是真正干活的函数：

```text
         ┌──────────── logging ────────────┐
         │      ┌─── approval ───┐         │
请求 ──→ │ ──→  │ ──→ 执行工具 ──→ │ ──→      │ ──→ 结果
         │      └────────────────┘         │
         └─────────────────────────────────┘
```

请求从外向内穿过每一层，结果从内向外穿回来，像剥洋葱。在 `next` 之前写的代码在"进去"的路上运行，之后写的在"出来"的路上运行：

```ts
const timing: Wrapper<ToolInvocation, ToolOutcome> = async (invocation, next) => {
  const start = performance.now(); //     进去的路上
  const outcome = await next(invocation);
  log(`${invocation.call.name} ${performance.now() - start}ms`); // 出来的路上
  return outcome;
};
```

一个包装可以做的事：

- **修改输入**：`next({ ...invocation, call: fixed })`
- **修改结果**：`return { ...outcome, content: mask(outcome.content) }`
- **不调用 `next`**：直接返回一个结果，里面的所有层都不会执行。权限拒绝、缓存命中都是这样
- **捕获错误**：`try { return await next(x) } catch { ... }`

Node.js 的 Koa、Redux 的中间件、很多 HTTP 客户端的拦截器都是这个模型，[2.5 节](../02-advanced-types/05-infer.md)说的"包装函数"也是它的一个特例。

### compose：把包装串起来

```ts
function compose<A, R>(wrappers: readonly Wrapper<A, R>[], handler: Next<A, R>): Next<A, R> {
  return (input) => {
    const dispatch = (index: number, value: A): Promise<R> => {
      const wrapper = wrappers[index];
      if (wrapper === undefined) return Promise.try(() => handler(value));
      return Promise.try(() => wrapper(value, (next) => dispatch(index + 1, next)));
    };
    return dispatch(0, input);
  };
}
```

`dispatch(i)` 调用第 `i` 个包装，传给它的 `next` 就是 `dispatch(i + 1)`；走到头就调用 `handler`。练习里还要处理一个陷阱：**一个包装调用了两次 `next`**（比如重试时忘了加 `return`，又往下调了一次），工具就会被执行两次。写文件、发消息这类工具执行两次是真正的事故，所以第二次调用 `next` 直接拒绝。Koa 的 `koa-compose` 也做了同样的检查，报的错误几乎一模一样：`next() called multiple times`。

## 权限确认

最重要的中间件是权限确认。agent 能读文件、写文件、执行命令，模型却可能理解错了用户的意思，也可能被它读到的内容"说服"去做别的事（6.9 节的提示注入）。**有副作用的操作要人来确认**：

```ts
requireApproval(["write_file", "run_command"], async (call) => {
  const answer = await rl.question(`允许 ${call.name}(${call.arguments}) 吗？(y/N) `);
  return answer === "y";
});
```

被拒绝时，工具不执行，模型收到一段说明："用户拒绝了这次调用，不要重试同样的操作"。最后半句很重要：没有它，模型常常会换个参数再试一次，用户就得一遍遍地拒绝。**给模型的错误信息要告诉它下一步该怎么做**，这在 [5.5 节](../05-validation/05-model-output.md)的修复循环里也说过。

权限确认放在中间件里，而不是写进每个工具，好处是：工具保持简单（只管做事），策略集中在一个地方（哪些工具要确认、怎么确认），而且换一种界面（网页上弹一个按钮）只需要换一个 `ask` 函数。

## 钩子的执行顺序

`beforeModel` 按顺序执行，每个拿到上一个的结果，像一条流水线；返回 `undefined` 表示"我不改"，这样只想读一读请求（比如记日志）的钩子不用写 `return request`。

`afterStep` 也按顺序执行，第一个要求停下的说了算，后面的不再调用。停止原因会记下是哪个中间件要求的，排查"agent 为什么停了"时一眼就能看到。

给钩子的 `messages` 是 **副本**。中间件可能把它存起来（比如记日志时异步地上传），如果给的是主循环里那个还在增长的数组，存起来的东西会悄悄变化：和 6.1 节"请求要发副本"是同一个道理。

## 中间件不是万能的

中间件适合"横切"的需求：和具体的工具、具体的任务无关，到处都要用。不适合的情况：

- **只和一个工具有关的逻辑**：写进那个工具里
- **改变循环结构的需求**（比如"先让一个模型规划，再让另一个模型执行"）：这是另一种 agent 架构，应该写一个新的循环，或者把整个 agent 当作另一个 agent 的工具
- **观察**：只想知道发生了什么，用事件流（上一节）或追踪（下一节）就够了，不需要插进执行路径

## 小结

- 插入点要少而精：`beforeModel` 改请求，`wrapToolCall` 包住工具调用，`afterStep` 决定停下
- 洋葱模型：包装拿到输入和 `next`，可以改输入、改结果、不调用 `next`、捕获错误；`compose` 把它们串起来，并拒绝重复调用 `next`
- 有副作用的工具要人确认；拒绝时告诉模型不要重试
- 钩子按顺序执行；给钩子的数据是副本
- 横切的需求用中间件，只关心一个工具的写进工具，只想观察的用事件和追踪

## 练习

[exercises/06-harness/07-middleware.ts](../../exercises/06-harness/07-middleware.ts)：实现 `compose`、`runBeforeModel`、`runAfterStep`、`toolPipeline`、`requireApproval`。运行 `pnpm ex 07-middleware`。

下一节：[6.8 追踪与日志](08-tracing.md)
