# 第 5 章：Schema 与运行时校验

> 类型在运行时就消失了。来自模型、API、环境变量、文件的数据，要在边界上检查过，才配得上它的类型：Zod、JSON Schema、校验模型的输出、解析 API 响应。

前四章里，所有外部数据都是"相信"进来的：`JSON.parse` 的结果直接 `as` 成想要的类型，第 2 章手写了一个只支持四种类型的迷你 schema。这一章解决的是 agent 里最常见的一类 bug：**类型说它是 `number`，运行时它是 `"3"`**。

先手写一个迷你 schema 库，弄明白"schema 是一个能推导出类型的值"是怎么回事；再学 Zod：对象、联合、转换、细化、品牌类型；然后把同一份 schema 变成给模型看的 JSON Schema，处理严格模式的规则；最后校验模型的输出（工具参数、结构化输出、修复循环）和 API 的响应（宽容地读、新的枚举值、缺少和 null）。

章末项目用 Zod 重写第 2 章的工具注册表，并作为 `@learn-ts/agent-kit/zod` 发布 0.2.0。

## 学完你能

- 说出哪些地方是信任边界，解释"解析，而不是验证"，知道为什么 `as` 和撒谎的类型谓词都不是校验
- 从零写出一个能推导类型的迷你 schema 库，理解 Zod 这类库的类型是怎么来的
- 用 Zod 描述对象、可选字段、联合（尤其是可辨识联合）、数组、记录和元组，读懂并定制它的错误信息
- 用 `refine`、`transform`、`pipe`、`preprocess`、`default`、`brand` 表达类型表达不了的规则，避开 `coerce` 和 `z.url()` 的坑
- 从 Zod 生成 JSON Schema，知道输入和输出的区别、什么会丢失，写出符合 OpenAI 严格模式的 schema
- 校验工具参数和模型的结构化输出，从夹杂文字的回答里取出 JSON，实现"生成 → 校验 → 反馈"的修复循环
- 写出对 API 的变化宽容、对用到的字段严格的 schema
- 设计一个依赖 Zod 的包：单独的入口、peerDependency、版本号

## 前置知识

- [第 1 章](../01-basics/README.md)：联合与收窄、`unknown`，以及章末项目的聊天记录类型（练习 5-2 会给它写 schema）
- [第 2 章](../02-advanced-types/README.md)：泛型、条件类型、`infer`；章末项目的工具注册表（本章项目会重写它）
- [第 3 章](../03-async/README.md)：流式客户端的 `parseChunk`（练习 5-6）、取消
- [第 4 章](../04-tooling/README.md)：`@learn-ts/agent-kit` 这个包，以及 `exports`、版本号

## 课程目录

| 节  | 内容                                                 | 示例                                                                          | 练习                                                                          |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 5.1 | [信任边界与手写校验](01-trust-boundaries.md)         | [01-trust-boundaries.ts](examples/01-trust-boundaries.ts)                     | [01-mini-schema](../../exercises/05-validation/01-mini-schema.ts)             |
| 5.2 | [Zod 基础](02-zod-basics.md)                         | [02-zod-basics.ts](examples/02-zod-basics.ts)                                 | [02-transcript-schema](../../exercises/05-validation/02-transcript-schema.ts) |
| 5.3 | [转换与细化](03-transforms-and-refinements.md)       | [03-transforms-and-refinements.ts](examples/03-transforms-and-refinements.ts) | [03-env-config](../../exercises/05-validation/03-env-config.ts)               |
| 5.4 | [JSON Schema：给模型看的 schema](04-json-schema.md)  | [04-json-schema.ts](examples/04-json-schema.ts)                               | [04-tool-schema](../../exercises/05-validation/04-tool-schema.ts)             |
| 5.5 | [校验模型的输出](05-model-output.md)                 | [05-model-output.ts](examples/05-model-output.ts)                             | [05-repair-loop](../../exercises/05-validation/05-repair-loop.ts)             |
| 5.6 | [解析 API 响应](06-api-responses.md)                 | [06-api-responses.ts](examples/06-api-responses.ts)                           | [06-chunk-schema](../../exercises/05-validation/06-chunk-schema.ts)           |
| 5.7 | [章末项目：用 Zod 定义工具](07-project-zod-tools.md) | [project/demo.ts](project/demo.ts)                                            | [project/toolbox](../../exercises/05-validation/project/toolbox.ts)           |

5.1 到 5.3 是基础，建议按顺序读。5.4 到 5.6 分别对应 agent 的三个方向（发给模型的、模型给的、API 给的），相对独立。章末项目用到 5.4 和 5.5 的练习。

## 关于这一章的练习

- 练习 5-1 不用任何库，从零写一个迷你 schema；之后的练习都用 [Zod 4](https://zod.dev/)，已经在仓库的依赖里
- 有的练习用 `z.never()` 作为 schema 的占位，把它换成你的 schema 即可；推导出的类型由类型测试（`*.test-d.ts`）检查
- 练习 5-2 的类型测试会比较你的 schema 推导出的类型和第 1 章手写的聊天记录类型：两者必须完全一致
- 每道练习都可以单独运行，例如 `pnpm ex 04-tool-schema`；`pnpm ex 05-validation` 运行本章的全部练习

## 章末项目：用 Zod 定义工具

把第 2 章的工具注册表换成 Zod：`defineTool` 的参数是一个 Zod schema，`execute` 的参数类型从 schema 的输出推导；`call` 接受输入类型；`schemas()` 用练习 5-4 生成函数描述，`strict` 的工具在启动时检查严格模式的规则；`dispatch` 用练习 5-5 解析参数，把不合格的参数、工具的错误都变成给模型看的文本，只有取消会抛出。演示程序里，假的模型两次传错参数，都从错误信息里找到线索改正了。参考答案整合进 [packages/agent-kit](../../packages/agent-kit/) 的新入口 `@learn-ts/agent-kit/zod`，版本升到 0.2.0。

## 自测清单

1. 为什么 `JSON.parse(text) as Message` 不是校验？类型谓词 `isMessage(x): x is Message` 写错了，TypeScript 会发现吗？
2. "解析，而不是验证"是什么意思？它和"校验通过后返回 `boolean`"相比，好在哪里？
3. `z.object`、`z.strictObject`、`z.looseObject` 对多余的键分别怎么处理？解析自己的配置文件和解析服务商的 API 响应，各该用哪个？
4. `.optional()` 和 `.exactOptional()` 推导出的类型有什么区别？和 `exactOptionalPropertyTypes` 有什么关系？
5. 对象上的 `refine` 在什么情况下不会运行？为什么？
6. `z.coerce.number()` 收到空字符串会得到什么？怎么避免？
7. 一个有默认值的字段，在 `z.input` 和 `z.output` 里分别是什么类型？给模型生成工具参数的 JSON Schema 时，该用哪一个？为什么？
8. 哪些 Zod 的功能生成 JSON Schema 时会悄悄丢掉？这会带来什么问题，怎么弥补？
9. OpenAI 的严格模式要求所有属性都在 `required` 里。怎么表达"这个参数可以不给"？
10. 用了严格模式的结构化输出，为什么还要校验？
11. 修复循环里，网络错误和"回答不符合 schema"应该怎么区别对待？
12. 服务商给 `finish_reason` 增加了一个新的值，你的 schema 会怎样？怎么写才能不受影响？
13. 一个包的部分功能依赖 zod，应该把 zod 放在 `dependencies`、`peerDependencies` 还是 `devDependencies`？为什么？

## 下一章

第 6 章：Agent Harness。把前五章的成果组装起来：消息循环、工具调用、上下文管理、错误重试，做出一个最小可用的 agent harness。编写中，敬请期待。
