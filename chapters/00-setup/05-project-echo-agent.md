# 0.5 章末项目：Echo Agent

> 这一节要解决的问题：把本章学到的工作流（读测试 → 写代码 → 运行 → 调试）完整走一遍，同时先看一眼 agent 程序的骨架。

## 要做什么

一个命令行聊天程序。它没有任何智能，只会复读和处理几条斜杠命令：

```
Echo Agent 已启动。输入 /help 查看命令，/exit 退出。
you> 你好
agent> 你说：你好
you> /upper hello agent
agent> HELLO AGENT
you> /reverse 你好世界
agent> 界世好你
you> /dance
agent> 未知命令：/dance。输入 /help 查看可用命令。
you> /exit
再见！
```

## 为什么这和 agent 有关

不管多复杂的 agent，最外层都是同一个循环：

```
等待输入 → 决定怎么回应 → 输出 → 继续等待
```

这个项目里，"决定怎么回应"是你写的 `reply()` 函数，只有几条 `if`。到了第 6 章，这一步会换成：把对话历史发给大模型，模型可能直接回答，也可能要求调用某个工具（就像这里的 `/upper`、`/count`），程序执行工具后把结果再交给模型……但外面那个循环的形状不会变。

还有一个值得注意的设计：**`reply()` 是一个纯函数**，输入一个字符串、返回一个字符串，不读终端、不打印任何东西。所有和终端打交道的代码都在 [project/cli.ts](project/cli.ts) 里。这样拆开以后，`reply()` 可以用测试完整覆盖，而不需要模拟一个终端。这个"把决策逻辑和输入输出分开"的思路，在后面写 harness 时会反复用到。

## 步骤

1. 读题：[exercises/00-setup/project/echo-agent.ts](../../exercises/00-setup/project/echo-agent.ts) 顶部的表格，以及旁边的 `echo-agent.test.ts`
2. 跑测试：`pnpm ex echo-agent`，看到一片红
3. 先实现 `shouldExit()`（简单），再实现 `reply()`：建议一次只让一组测试变绿，比如先处理普通文本，再处理 `/help`，最后处理带参数的命令
4. 测试全绿后，亲自玩一玩：

   ```bash
   pnpm tsx chapters/00-setup/project/cli.ts
   ```

5. 卡住了就用 0.4 节的方法调试；实在想不出来再看 [参考答案](../../solutions/00-setup/project/echo-agent.ts)

## 用得上的 JavaScript 知识

你还没学 TypeScript 的类型语法，但这个项目也不需要。下面这些字符串方法够用了：

```ts
"  hi  ".trim(); // "hi"：去掉首尾空白
"/help".startsWith("/"); // true
"hello".toUpperCase(); // "HELLO"
"a b  c".split(/\s+/); // ["a", "b", "c"]：按一段或多段空白切分
[..."你好"]; // ["你", "好"]：把字符串拆成字符数组
["a", "b"].reverse().join(""); // "ba"
```

`/\s+/` 是正则表达式，`\s` 表示任意空白字符，`+` 表示"一个或多个"。

拆分命令名和参数有很多种写法。可以先找第一个空白的位置，也可以用 `split` 后再把剩下的部分拼回去，还可以用正则。选你觉得最清楚的那种。

## 做完之后

- 对比你的代码和参考答案，有哪些写法不同？哪种更好读？
- 试着加一条新命令（比如 `/repeat 3 hi` → `hi hi hi`），先写测试再写实现
- 进入[第 1 章](../01-basics/README.md)，开始真正学习 TypeScript 的类型系统

## 小结

- agent 程序的骨架是一个"输入 → 决策 → 输出"的循环
- 把决策逻辑写成纯函数，和输入输出代码分开，才容易测试
- 测试驱动的节奏：一次让一小组测试变绿
