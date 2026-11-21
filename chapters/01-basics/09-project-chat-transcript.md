# 1.9 章末项目：聊天记录的类型模型

> 这一节要解决的问题：把本章学到的对象类型、字面量类型、可辨识联合、类型收窄、可选属性全部用上，为 agent 最核心的数据结构建立类型模型。

## 背景：agent 的记忆就是一份聊天记录

调用大模型 API 时，你发送的不是"一个问题"，而是 **整份对话历史**。模型本身不记得任何东西，它每次都是读完整份记录再决定说什么。所以 agent harness 的主循环大致是这样的：

```
记录 = [系统提示, 用户的问题]
循环：
  回应 = 模型(记录)
  记录.追加(回应)
  如果 回应 里有工具调用：
    对每个工具调用：
      结果 = 执行工具(调用)
      记录.追加(结果)
  否则：
    结束
```

记录里有四种角色的消息：

| 角色        | 谁产生的 | 内容                                   |
| ----------- | -------- | -------------------------------------- |
| `system`    | 开发者   | 系统提示：模型的身份、规则、可用的工具 |
| `user`      | 用户     | 用户说的话                             |
| `assistant` | 模型     | 模型说的话，以及它请求的工具调用       |
| `tool`      | harness  | 工具执行的结果，通过 ID 对应到某次调用 |

这正是一个可辨识联合，`role` 就是辨识字段。

## 类型设计

完整的类型定义在 [exercises/01-basics/project/transcript.ts](../../exercises/01-basics/project/transcript.ts) 的开头，已经替你写好了。动手之前，先读一遍，留意这些设计决策：

**1. 每种角色一个 interface，再组成联合。** 而不是一个包含所有可选字段的大接口：

```ts
// ❌ 一个"万能"接口：什么组合都合法，类型系统帮不上忙
interface Message {
  role: Role;
  content: string;
  toolCalls?: ToolCall[]; // user 消息能有工具调用吗？
  toolCallId?: string; // assistant 消息能有 toolCallId 吗？
}

// ✅ 可辨识联合：每种角色只有属于它的字段
type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;
```

用了联合，"user 消息带着工具调用"这种不合法的数据根本 **构造不出来**。这就是常说的"让非法状态无法表示"（make illegal states unrepresentable），是用类型建模时最重要的一条原则。

**2. 可选属性表示"没有"，而不是空数组或 `false`。** 没有工具调用的 assistant 消息不带 `toolCalls` 属性；成功的工具结果不带 `isError` 属性。配合 `exactOptionalPropertyTypes`，"没有"只有一种表示方式，比较和序列化都更简单。构造函数会负责维持这个约定。

**3. 工具参数是 `Record<string, unknown>`。** 参数来自模型，具体结构取决于工具。在这一层我们不假设它的形状；第 5 章会用 schema 为每个工具校验参数。

**4. `Transcript` 是 `readonly Message[]`。** 分析函数只读取记录，不修改它。

## 你要实现的函数

| 函数                                 | 作用                        | 在 harness 中的用途                 |
| ------------------------------------ | --------------------------- | ----------------------------------- |
| `systemMessage` 等构造函数           | 创建符合约定的消息对象      | 往记录里追加消息                    |
| `renderMessage` / `renderTranscript` | 渲染成可读的文本            | 调试日志、终端界面                  |
| `countByRole`                        | 统计各角色的消息数          | 监控、上下文裁剪                    |
| `pendingToolCalls`                   | 找出还没有结果的工具调用    | **决定循环是继续还是结束**          |
| `validateTranscript`                 | 检查记录是否符合 API 的要求 | 发送前自检，尽早发现 harness 的 bug |

建议的顺序：构造函数 → `renderMessage` → `renderTranscript` → `countByRole` → `pendingToolCalls` → `validateTranscript`。最后一个最复杂，它要求你在遍历过程中维护状态。

```bash
pnpm ex transcript                        # 测试
pnpm tsx chapters/01-basics/project/demo.ts   # 全部完成后，看看一份完整的记录
```

## 提示

- `renderMessage` 和 `validateTranscript` 都要对 `role` 做 `switch`，记得加上穷尽性检查
- `validateTranscript` 的规则 4 需要知道"当前有哪些调用在等待结果"，遍历时用一个数组维护它；判断"某个 ID 是否发起过"用 `Set<string>` 更方便（`has`、`add` 方法）
- 遍历时需要下标，可以用 `transcript.forEach((message, index) => { ... })`，或者 `for (const [index, message] of transcript.entries())`
- 构造函数里的可选属性，回顾 [1.8 节](08-strictness.md#exactoptionalpropertytypes可选不等于可以是-undefined) 的写法

## 做完之后

对照 [参考答案](../../solutions/01-basics/project/transcript.ts)，然后想一想：

1. 如果要支持一种新的角色（比如有些 API 有 `developer` 角色），需要改哪些地方？TypeScript 会提醒你吗？试着加一下，看看编译器指出了哪些位置
2. 真实 API 里，`content` 往往不只是字符串，而是练习 1-5 里那样的内容块数组。如果要把两者结合，`AssistantMessage` 的类型应该怎么改？
3. `validateTranscript` 返回的是字符串数组。如果调用方想根据问题的种类做不同的处理，返回什么类型更好？（提示：又是一个可辨识联合）

第 6 章写 harness 时，我们会回到这个模型，并用第 2 章学的泛型和类型运算让它更通用、更精确。

## 小结

- agent 的状态就是一份不断追加的聊天记录，用可辨识联合建模最自然
- 让非法状态无法表示：每种角色只有属于它的字段
- "等待中的工具调用"决定了 agent 循环是继续还是结束
