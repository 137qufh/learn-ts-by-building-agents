# 第 1 章：类型基础

> 学会用 TypeScript 的类型描述数据和函数，并让编译器替你挡住一大类 bug。

这一章覆盖了日常写 TypeScript 用到的绝大部分类型知识。学完以后，你就能读懂大多数库的类型定义，也能为自己的数据建立精确的类型模型。章末项目会为 agent 最核心的数据结构（聊天记录）建模。

## 学完你能

- 为变量、函数、对象、数组写出合适的类型，并判断哪里该写、哪里交给推断
- 解释 `interface` 和 `type` 的区别，并在项目中一致地使用它们
- 用字面量联合和可辨识联合为"几种可能之一"的数据建模
- 用 `typeof`、`in`、`instanceof`、辨识字段、自定义守卫收窄类型，并写出穷尽性检查
- 安全地处理外部数据和错误：用 `unknown` 而不是 `any`
- 说出本仓库每个严格选项拦住的是哪一类 bug，并读懂较长的类型错误信息

## 前置知识

- [第 0 章](../00-setup/README.md)：能运行示例、能用 `pnpm ex` 做练习

## 课程目录

| 节  | 内容                                                          | 示例                                                                      | 练习                                                                  |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1.1 | [基本类型与类型推断](01-primitives-and-inference.md)          | [01-primitives-and-inference.ts](examples/01-primitives-and-inference.ts) | （与 1.2 合并）                                                       |
| 1.2 | [对象类型、interface 与 type](02-objects-and-interfaces.md)   | [02-objects-and-interfaces.ts](examples/02-objects-and-interfaces.ts)     | [01-usage](../../exercises/01-basics/01-usage.ts)                     |
| 1.3 | [数组与元组](03-arrays-and-tuples.md)                         | [03-arrays-and-tuples.ts](examples/03-arrays-and-tuples.ts)               | [02-model-id](../../exercises/01-basics/02-model-id.ts)               |
| 1.4 | [函数](04-functions.md)                                       | [04-functions.ts](examples/04-functions.ts)                               | [03-backoff](../../exercises/01-basics/03-backoff.ts)                 |
| 1.5 | [字面量类型](05-literal-types.md)                             | [05-literal-types.ts](examples/05-literal-types.ts)                       | [04-stop-reason](../../exercises/01-basics/04-stop-reason.ts)         |
| 1.6 | [联合类型与类型收窄](06-unions-and-narrowing.md)              | [06-unions-and-narrowing.ts](examples/06-unions-and-narrowing.ts)         | [05-content-parts](../../exercises/01-basics/05-content-parts.ts)     |
| 1.7 | [any、unknown 与 never](07-any-unknown-never.md)              | [07-any-unknown-never.ts](examples/07-any-unknown-never.ts)               | [06-tool-arguments](../../exercises/01-basics/06-tool-arguments.ts)   |
| 1.8 | [严格模式](08-strictness.md)                                  | [08-strictness.ts](examples/08-strictness.ts)                             |                                                                       |
| 1.9 | [章末项目：聊天记录的类型模型](09-project-chat-transcript.md) | [project/demo.ts](project/demo.ts)                                        | [project/transcript](../../exercises/01-basics/project/transcript.ts) |

建议按顺序学习。1.6 是本章最重要的一节，值得多花时间。

每道练习都可以单独运行，例如 `pnpm ex 01-usage`；`pnpm ex 01-basics` 会运行本章的全部练习。

## 章末项目：聊天记录的类型模型

agent 的全部"记忆"就是一份聊天记录：系统提示、用户的话、模型的回答、工具调用和工具结果。你将为它建立类型模型，并实现构造、渲染、统计、"找出还没有结果的工具调用"、合法性检查等函数。第 6 章写 harness 时会直接用到这些思路。

## 自测清单

1. 什么时候必须写类型标注？什么时候不应该写？
2. `const role = "user"` 和 `const msg = { role: "user" }` 里，`role` 的类型分别是什么？为什么不一样？
3. 为什么直接写出的对象字面量会检查多余属性，而通过变量赋值时不会？
4. `interface` 的 `extends` 和 `type` 的 `&` 遇到冲突属性时，表现有什么不同？
5. `if (!count)` 用来检查"count 有没有值"有什么问题？`??` 和 `||` 的区别是什么？
6. 什么是可辨识联合？穷尽性检查是怎么利用 `never` 的？
7. `any` 和 `unknown` 都能接收任何值，它们的根本区别是什么？
8. `{}` 和 `{ temperature: undefined }` 在运行时有什么区别？`exactOptionalPropertyTypes` 为什么要区分它们？
9. `as` 类型断言会做运行时检查吗？什么时候用它是合理的？

## 下一章

[第 2 章：进阶类型](../02-advanced-types/README.md)：泛型、`keyof`、映射类型、条件类型、`infer`、模板字面量类型，以及怎么读懂复杂的类型错误。章末做一个类型安全的工具注册表。
