# 4.8 调试与性能分析

> 这一节要解决的问题：[0.4 节](../00-setup/04-debugging.md)学会了在 VS Code 里打断点。但有些问题断点帮不上忙：报错的堆栈指向编译后的 `dist/xxx.js`，行号对不上源码；用户说"一轮对话要等十几秒"，到底慢在哪里？内存为什么一直涨？`tsc` 自己为什么变慢了？

示例代码：[examples/08-debugging-and-profiling.ts](examples/08-debugging-and-profiling.ts)

## source map：让报错指回源码

直接用 Node 运行 `.ts` 时，Node 只是把类型替换成空白，行号和列号都不变，所以堆栈一直是准确的。但运行编译后的代码（比如用户安装的 `@learn-ts/agent-kit`）时，堆栈指向的是 `.js` 文件：

```text
不带 source map： at load (file://…/dist/main.js:4:15)
带 source map：   at load (…/src/main.ts:8:11)
```

4.3 节编译时开启了 `sourceMap`，`tsc` 为每个 `.js` 生成一个 `.js.map`。加上 `--enable-source-maps` 运行，Node 就会读取这些 map 文件，把堆栈翻译回源码位置。也可以写进环境变量，对所有 Node 进程生效：`NODE_OPTIONS=--enable-source-maps`。

VS Code 的调试器默认就会使用 source map，所以在编译后的代码里打断点，也能停在 `.ts` 源码的对应行上。

## 调试一个正在运行的进程

0.4 节的调试方式都是"从 VS Code 里启动程序"。有时程序是别处启动的（命令行、测试、子进程），可以让 Node 打开调试端口：

```bash
node --inspect-brk dist/main.js     # 启动后在第一行停住，等调试器连上
node --inspect dist/main.js         # 不停住，随时可以连
```

然后用 VS Code 的"附加到 Node 进程"（Attach），或者在 Chrome 里打开 `chrome://inspect` 连接。在代码里写一行 `debugger;`，连着调试器时会在那里停住，没连调试器时什么也不做。

## 先测量，再优化

性能问题最常见的错误是 **凭感觉优化**：花一天把 JSON 解析优化快了一倍，结果它只占总时间的 1%，真正的大头是模型 API 的网络等待。所以第一步永远是测量。

### 给代码计时

```ts
performance.mark("parse:start");
// ……要计时的代码……
performance.mark("parse:end");
const { duration } = performance.measure("parse", "parse:start", "parse:end");
```

或者更简单地用 `performance.now()` 相减。计时一定要用 `performance.now()` 而不是 `Date.now()`：前者是 **单调时钟**，精度到微秒，不受系统时间调整的影响；后者表示"现在几点"，用户改了系统时间，或者系统自动校时，算出的时长可能是负数。

### 看分布，而不是平均值

假设一个工具调用了 100 次，平均 50ms。这可能是每次都 50ms，也可能是 95 次 10ms、5 次 810ms。对用户来说后者糟糕得多：每 20 次就有一次卡顿将近一秒。所以要看 **百分位数**：

- **p50**（中位数）：一半的调用比它快，代表典型情况
- **p95、p99**：最慢的 5%、1% 有多慢，代表"糟糕的时候"有多糟

本节的练习会写一个计时器，按名字汇总每类操作的次数、总耗时、p50、p95。harness 有了它，就能回答"这一轮对话的时间花在哪里"。

### CPU 分析

知道了"慢在哪个函数调用里"，下一步是"这个函数里慢在哪一行"。Node 自带 CPU 分析器：

```bash
node --cpu-prof --cpu-prof-dir=profiles main.ts
```

程序结束时，会在 `profiles/` 下生成一个 `.cpuprofile` 文件。把它拖进 Chrome 开发者工具的 Performance 面板，或者用 VS Code 打开，就能看到火焰图：每个函数占用了多少 CPU 时间，被谁调用。

注意 CPU 分析只能告诉你 **CPU 在忙什么**。如果程序大部分时间在等网络（agent 通常是这样），CPU 分析里看到的会是一片空闲，这时应该用上面的计时器去看等待时间。

## 事件循环被卡住了吗

第 3 章讲过，Node 只有一个线程执行 JavaScript。一段同步代码运行 100ms，这 100ms 里所有的定时器、网络回调、用户输入都只能等着。示例代码的第 3 部分用 `monitorEventLoopDelay` 测量了这件事：

```text
事件循环延迟：p50 10ms，最大 109ms
```

故意忙等的 100ms 全部体现在了最大延迟里（p50 的 10ms 是采样精度）。在 harness 里，如果流式输出时文字一顿一顿的，很可能就是某个同步操作卡住了事件循环：一次解析巨大的 JSON、同步读一个大文件（`readFileSync`）、一个复杂的正则表达式。解决办法是改成异步 API、分批处理，或者把重活交给 Worker 线程。

## 内存

```ts
process.memoryUsage().heapUsed; // 当前 JavaScript 堆的占用，单位是字节
```

内存问题通常是 **泄漏**：某个东西一直被引用着，垃圾回收器没法回收它。agent 里最常见的几种：

- 对话历史无限增长，从不截断
- 缓存（`Map`）只加不删
- 事件监听器只 `on` 不 `off`（[3.6 节](../03-async/06-cancellation.md)的 `abort` 监听器就要记得移除）

定位泄漏用 **堆快照**：`node --inspect` 连上 Chrome 开发者工具，在 Memory 面板里拍两次快照（中间让程序跑一会儿），对比哪类对象在增多。`node --heapsnapshot-signal=SIGUSR2` 则可以在收到信号时自动生成快照，适合在服务器上排查。

## `tsc` 自己的性能

项目大了，类型检查也会变慢。`--extendedDiagnostics` 显示时间花在哪个阶段：

```bash
pnpm tsc --extendedDiagnostics
```

```text
Files:              585
Types:            50512
Instantiations:   68880
Check time:      0.104s
Total time:      0.215s
```

`Instantiations`（泛型实例化的次数）异常地大，通常说明某个复杂的类型（第 2 章那些递归的条件类型、映射类型）在被反复计算。TypeScript 7 比 6 快了大约十倍，大部分项目不再需要操心这件事，但写类型很重的库时还是值得看一眼。[2.8 节](../02-advanced-types/08-debugging-type-errors.md)讲过 `Type instantiation is excessively deep`，也是同一类问题。

## 小结

- 运行编译后的代码时用 `--enable-source-maps`，堆栈才会指向源码
- `--inspect` / `--inspect-brk` 让调试器附加到任何 Node 进程
- 先测量再优化；计时用 `performance.now()`；看 p50/p95，不要只看平均值
- `--cpu-prof` 看 CPU 在忙什么；agent 多半在等网络，那要靠计时器
- `monitorEventLoopDelay` 发现卡住事件循环的同步代码
- 内存泄漏用堆快照对比；`tsc --extendedDiagnostics` 看类型检查的耗时

## 练习

[exercises/04-tooling/08-profiling.ts](../../exercises/04-tooling/08-profiling.ts)：实现百分位数和一个可以注入时钟的计时器 `createTracer`。运行 `pnpm ex 08-profiling`。

下一节：[4.9 章末项目：@learn-ts/agent-kit](09-project-agent-kit.md)
