# 第 2 章：进阶类型

> 学会"用类型计算类型"：从已有的类型和值推导出新的类型，让一份定义同时驱动编译期检查和运行时行为。

第 1 章教你描述数据。这一章教你 **变换** 类型：写一次逻辑适用于多种类型（泛型），从对象类型取出键和值（`keyof`、索引访问），批量改写属性（映射类型），根据条件选择类型（条件类型），从类型中拆出一部分（`infer`），甚至在类型层面处理字符串（模板字面量类型）。

这些是读懂 Zod、tRPC、各家 AI SDK 等库的类型定义的前提，也是写出"用起来很舒服"的 API 的关键。最后一节专门讲怎么读懂和调试复杂的类型错误，类型写得越高级，这项能力越重要。章末项目会做一个类型安全的工具注册表，它是后面 agent harness 的核心部件之一。

## 学完你能

- 写出能被正确推断的泛型函数和泛型类型，用约束、`const` 类型参数和 `NoInfer` 控制推断
- 用 `typeof`、`keyof`、索引访问类型从值和已有类型推导出新类型，并写出 `get(obj, key)` 这样键和值类型关联的函数
- 用映射类型、条件类型、`infer` 和模板字面量类型实现常见的类型变换，并解释分配条件类型的行为
- 熟练组合 `Partial`、`Pick`、`Omit`、`ReturnType` 等内置工具类型，知道它们的坑
- 面对一屏幕的类型错误，找到真正的原因；类型结果不对时，能一步步拆开排查
- 用 `expectTypeOf` 为类型写测试

## 前置知识

- [第 1 章](../01-basics/README.md)：尤其是字面量类型、联合类型与收窄（1.5、1.6）

## 课程目录

| 节  | 内容                                                           | 示例                                                                      | 练习                                                                                |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 2.1 | [泛型](01-generics.md)                                         | [01-generics.ts](examples/01-generics.ts)                                 | [01-result](../../exercises/02-advanced-types/01-result.ts)                         |
| 2.2 | [keyof、typeof 与索引访问类型](02-keyof-and-indexed-access.md) | [02-keyof-and-indexed-access.ts](examples/02-keyof-and-indexed-access.ts) | [02-settings](../../exercises/02-advanced-types/02-settings.ts)                     |
| 2.3 | [映射类型](03-mapped-types.md)                                 | [03-mapped-types.ts](examples/03-mapped-types.ts)                         | [03-agent-state](../../exercises/02-advanced-types/03-agent-state.ts)               |
| 2.4 | [条件类型](04-conditional-types.md)                            | [04-conditional-types.ts](examples/04-conditional-types.ts)               | [04-messages](../../exercises/02-advanced-types/04-messages.ts)                     |
| 2.5 | [infer：从类型中提取类型](05-infer.md)                         | [05-infer.ts](examples/05-infer.ts)                                       | [05-tool-wrappers](../../exercises/02-advanced-types/05-tool-wrappers.ts)           |
| 2.6 | [模板字面量类型](06-template-literal-types.md)                 | [06-template-literal-types.ts](examples/06-template-literal-types.ts)     | [06-naming](../../exercises/02-advanced-types/06-naming.ts)                         |
| 2.7 | [内置工具类型](07-utility-types.md)                            | [07-utility-types.ts](examples/07-utility-types.ts)                       | [07-chat-request](../../exercises/02-advanced-types/07-chat-request.ts)             |
| 2.8 | [读懂和调试复杂的类型错误](08-debugging-type-errors.md)        | [08-debugging-type-errors.ts](examples/08-debugging-type-errors.ts)       | [08-fix-the-types](../../exercises/02-advanced-types/08-fix-the-types.ts)           |
| 2.9 | [章末项目：类型安全的工具注册表](09-project-tool-registry.md)  | [project/demo.ts](project/demo.ts)                                        | [project/tool-registry](../../exercises/02-advanced-types/project/tool-registry.ts) |

建议按顺序学习。2.1 和 2.4 是本章的基础，2.8 值得在做练习时反复回来看。

## 关于类型练习

从这一章开始，大部分练习考的是类型本身。每道练习除了运行时测试（`*.test.ts`），还有一个类型测试文件（`*.test-d.ts`），用 Vitest 的 `expectTypeOf` 检查你写的类型：

```ts
expectTypeOf<MessageOfRole<"tool">>().toEqualTypeOf<ToolMessage>();
expectTypeOf(ok(42)).toEqualTypeOf<Result<number, never>>();
```

- 类型测试不会运行，而是交给 `tsc` 检查。`pnpm ex 01-result` 会同时运行两种测试，类型测试的失败会显示在 `Type Errors` 下面
- 题目里还没实现的类型写成 `Todo`，需要你写签名的函数先用 `any` 占位。你的答案里不应该出现 `any`
- 想看 `tsc` 的完整错误信息，运行 `pnpm ex:types`（它检查全部练习，没做完的部分也会报错，只看你关心的文件即可）
- 编辑器里打开 `*.test-d.ts`，没做完的断言会直接标红，悬停就能看到原因
- 运行时 Vitest 会提示 "Testing types with tsc and vue-tsc is an experimental feature"，可以忽略
- 读不懂类型测试的失败信息时，看 [2.8 节](08-debugging-type-errors.md#读懂类型测试的失败信息)

每道练习都可以单独运行，例如 `pnpm ex 01-result`；`pnpm ex 02-advanced-types` 会运行本章的全部练习。

## 章末项目：类型安全的工具注册表

模型调用工具时，需要三样互相一致的东西：给你看的参数类型、给模型看的 JSON Schema、给 harness 用的运行时校验。你将实现一个注册表，只写一份参数描述，从它推导出全部三样；在代码里调用工具时，工具名、参数、返回值都有精确的类型；执行模型发来的调用时，逐项校验、永不崩溃。第 3 章会把它的 Schema 发给真正的模型，第 6 章的 agent 主循环用它执行工具。

## 自测清单

1. 什么样的类型参数是"多余的"？`function f<T>(x: T): void` 有什么问题？
2. `const` 类型参数和在调用处写 `as const` 有什么区别？`NoInfer<T>` 解决的是什么问题？
3. `keyof { a: 1; b: 2 }` 是什么？`keyof Record<string, number>` 呢？为什么 `Object.keys` 返回 `string[]` 而不是 `(keyof T)[]`？
4. 映射类型 `{ [K in keyof T]: ... }` 什么时候会保留原来的 `readonly` 和 `?`？怎么去掉它们？
5. 什么是分配条件类型？`IsString<string | number>` 的结果是什么？怎么阻止分配？为什么 `T extends ... ? ... : ...` 遇到 `never` 会得到 `never`？
6. `infer` 只能写在哪里？`T extends [infer First, ...infer Rest]` 匹配空元组时会怎样？
7. `` `${"get" | "set"}_${"a" | "b"}` `` 是什么类型？
8. 为什么 `Omit<A | B, "id">` 的结果和你想的不一样？怎么写一个对联合逐个成员 `Omit` 的版本？
9. 遇到"参数的类型是 `never`"的错误，最常见的原因是什么？怎么改？
10. 函数参数是"反过来"比较的，这是什么意思？为什么"任何函数"的类型要写成 `(args: never) => unknown`？

## 下一章

[第 3 章：异步与流式](../03-async/README.md)：`Promise`、`async`/`await`、错误处理、并发、取消与超时、重试、异步迭代器和流，并写出第一个流式的大模型客户端。
