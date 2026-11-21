# 2.9 章末项目：类型安全的工具注册表

> 这一节要解决的问题：把本章的泛型、`keyof`、映射类型、条件类型、`infer`、模板字面量类型全部用上，做出 agent 的第二个核心部件：一个"只写一次参数描述，就同时得到编译期类型和运行时校验"的工具注册表。

## 背景：模型怎么调用工具

agent 之所以能"做事"，是因为模型可以请求调用工具。过程是这样的：

1. 我们把每个工具的 **说明** 发给模型：名字、用途、参数的 JSON Schema
2. 模型回复时，可能附带一个或多个 **工具调用**：`{ id, name: "get_weather", arguments: '{"city":"北京"}' }`
3. harness 找到对应的工具，**校验参数**，执行，把结果作为 `tool` 消息追加进聊天记录（就是第 1 章项目里的 `toolMessage`）
4. 模型读到结果，继续回答或发起下一次调用

注意第 2 步里的 `arguments`：它是模型 **生成** 的一段 JSON 字符串。模型可能拼错参数名、给错类型、编出一个根本不存在的工具，甚至生成不合法的 JSON。所以执行之前必须校验，而且出错时不能让整个 agent 崩溃，要把错误告诉模型，让它自己改正。

于是每个工具都需要三样东西，而且它们必须一致：

| 需要                   | 给谁       | 什么时候 |
| ---------------------- | ---------- | -------- |
| 参数的 TypeScript 类型 | 写工具的你 | 编译期   |
| 参数的 JSON Schema     | 模型       | 运行时   |
| 参数的校验逻辑         | harness    | 运行时   |

如果分开手写三份，迟早会改了一份忘了另外两份。这个项目的做法是：**只写一份参数描述，另外三样都从它推导出来。**

```ts
const weather = defineTool({
  name: "get_weather",
  description: "查询城市的天气",
  parameters: {
    city: { type: "string", description: "城市名" },
    unit: { type: "enum", values: ["c", "f"], optional: true },
  },
  execute: (args) => `${args.city}：晴`, // args: { city: string; unit?: "c" | "f" }
});
```

参数描述是一个普通的对象（运行时存在，可以用来生成 Schema、做校验），而 `args` 的类型是用类型运算从这个对象的 **类型** 推导出来的。这正是本章所有工具的用武之地。

> 第 5 章会用 [Zod](https://zod.dev) 替换这里手写的迷你 schema。Zod 的 `z.infer<typeof schema>` 做的事情和你将要写的 `InferArgs` 完全一样，只是覆盖的情况更多。做完这个项目，你就知道 Zod 的类型是怎么工作的了。

## 动手之前：读一遍给出的代码

题目在 [exercises/02-advanced-types/project/tool-registry.ts](../../exercises/02-advanced-types/project/tool-registry.ts)。开头已经给出了这些类型，先读懂它们：

- **`ParamSpec`**：一个参数的描述，是以 `type` 为辨识字段的可辨识联合（1.6 节）
- **`ParamsSpec`**：`Record<string, ParamSpec>`，参数名到描述的映射
- **`Tool<N, S, R>`**：一个工具。三个类型参数分别是工具名、参数描述、返回值类型
- **`AnyTool`**："任何工具"，下面专门解释
- **`ToolRegistry<T>`**：注册表的接口，`T` 是所有已注册工具组成的 **联合类型**

### 为什么 `AnyTool` 的参数是 `never`

注册表要能存放各种各样的工具，所以需要一个"任何工具都能赋值给它"的类型。直觉上会写 `Tool<string, ParamsSpec, unknown>`，但它不行：

```
Type 'Tool<"w", { readonly city: { readonly type: "string"; }; }, string>' is not assignable to type 'Tool<string, ParamsSpec, unknown>'.
  Types of property 'execute' are incompatible.
    Type '(args: { city: string; }) => string' is not assignable to type '(args: { [x: string]: string | number | boolean; }) => unknown'.
      Types of parameters 'args' and 'args' are incompatible.
        Property 'city' is missing in type '{ [x: string]: string | number | boolean; }' but required in type '{ city: string; }'.
```

按 2.8 节的方法从最后一行读：问题出在参数上。函数参数是 **反过来** 比较的：`(args: A) => R` 能赋值给 `(args: B) => R`，要求 B 能赋值给 A，也就是"别人传给我的东西，我都能处理"。一个只会处理 `{ city: string }` 的函数，处理不了任意的 `{ [x: string]: ... }`，所以不能赋值。

那什么类型能赋值给 **所有** 参数类型？`never`。所以 `(args: never) => unknown` 是"任何函数"的上界，任何 `execute` 都能赋值给它。代价是：拿着一个 `AnyTool`，你没法直接调用它的 `execute`（你造不出一个 `never` 类型的值）。这正合适：只有在校验过参数之后，才应该调用工具。

## 五个部分

按顺序完成，每部分都有对应的测试。运行时测试在 `tool-registry.test.ts`，类型测试在 `tool-registry.test-d.ts`。

```bash
pnpm ex tool-registry                            # 运行时测试和类型测试
pnpm ex:types                                    # 看 tsc 的完整错误信息
pnpm tsx chapters/02-advanced-types/project/demo.ts  # 全部完成后，看看效果
```

### 第一部分：从参数描述推导参数类型

| 类型                                  | 作用                     | 用到     |
| ------------------------------------- | ------------------------ | -------- |
| `ParamValue<P>`                       | 一个参数描述对应的值类型 | 2.4、2.5 |
| `RequiredKeys<S>` / `OptionalKeys<S>` | 必需 / 可选参数的键      | 2.3、2.4 |
| `InferArgs<S>`                        | 整个参数对象的类型       | 2.3、2.8 |

这是整个项目的核心。`InferArgs` 的结果要和手写的类型 **完全相同**：必需参数是必需属性，可选参数是可选属性，没有 `readonly`，并且展开成一个对象类型（类型测试用 `toEqualTypeOf` 比较，`{ a: string } & { b?: number }` 和 `{ a: string; b?: number }` 不算相同）。

### 第二部分：`defineTool`

`defineTool` 在运行时只是原样返回参数，它的意义全在类型上：

- 工具名要保持字面量类型（`"get_weather"` 而不是 `string`），否则注册表没法按名字区分工具
- 参数描述里的 `values: ["c", "f"]` 要保持字面量，`optional: true` 要保持 `true` 而不是 `boolean`
- `execute` 的 `args` 要自动推断为 `InferArgs<参数描述>`
- 调用方不需要写 `as const`

你需要自己写出 `defineTool` 的签名。提示：2.1 节的 `const` 类型参数。

### 第三部分：运行时校验 `validateArgs`

类型只存在于编译期。模型发来的参数在运行时是 `unknown`，必须逐个检查。题目注释里列出了每种错误的确切格式，测试会逐字比较。

这一部分的难点不在逻辑，而在类型：你检查完所有字段之后，TypeScript 并不知道 `input` 已经符合 `InferArgs<S>`，因为它无法从一个循环里推理出这个结论。这里需要一次 `as` 断言。这是整个项目里最关键的一次断言：**类型安全的边界就在这里**。断言之外的代码可以完全信任 `args` 的类型，前提是这里的校验真的覆盖了所有情况。这也是为什么这一部分的测试最多。

### 第四部分：生成 JSON Schema `toSchema`

把参数描述翻译成模型 API 要求的 JSON Schema。这一部分是纯运行时代码，用来练习可辨识联合的处理和 `exactOptionalPropertyTypes` 下的可选属性（只在有 `description` 时才写这个属性）。

### 第五部分：注册表

先写几个类型：

| 类型                        | 作用                       | 用到     |
| --------------------------- | -------------------------- | -------- |
| `ToolName<T>`               | 工具联合中所有工具名的联合 | 2.2      |
| `ToolByName<T, N>`          | 按名字从联合中挑出一个工具 | 2.4、2.7 |
| `ArgsOf<T>` / `ResultOf<T>` | 工具的参数类型和返回类型   | 2.5、2.7 |

然后实现 `createRegistry`。注册表是 **不可变** 的：`register` 返回一个新的注册表，类型参数从 `ToolRegistry<T>` 变成 `ToolRegistry<T | U>`。这是让类型"随着调用链增长"的常用写法：

```ts
const tools = createRegistry() // ToolRegistry<never>
  .register(weather) // ToolRegistry<typeof weather>
  .register(add); // ToolRegistry<typeof weather | typeof add>

tools.call("add", { a: 1, b: 2 }); // 返回 number
tools.call("add", { a: 1 }); // ❌ 缺少 b
tools.call("search", {}); // ❌ "search" 不是已注册的工具名
```

为什么必须返回新的注册表，而不能修改原来的？因为变量的类型在声明时就确定了。`const r = createRegistry()` 的类型永远是 `ToolRegistry<never>`，就算你往里面加了工具，`r` 的类型也不会变。只有返回一个新的值，新的类型才有地方"安放"。

`call` 是给你自己的代码用的，名字和参数都在编译期检查过了。`dispatch` 是给模型的调用用的，一切都要在运行时检查，并且 **永远不抛出异常**：出了任何问题都返回 `{ ok: false, error }`，这样 harness 可以把错误信息原样交给模型，让它修正后重试。

内部实现建议用一个普通的 `Map<string, AnyTool>`。类型安全由 `ToolRegistry<T>` 接口在边界上保证，实现内部用少量受控的断言把两者连接起来。这是写类型安全的库时非常常见的结构：**对外的类型精确，对内的实现简单。**

### 挑战：重复注册在编译期报错

给出的 `register` 签名允许重复注册同名工具，只在运行时抛错。挑战是让它在编译期就报错，而且错误信息要说人话：

```
Argument of type 'Tool<"w", ...>' is not assignable to parameter of type '"工具 \"w\" 已经注册过了"'.
```

提示：回顾 2.8 节的 [写类型时就让错误好懂](08-debugging-type-errors.md#写类型时就让错误好懂)。参数的类型可以是一个条件类型：名字没冲突时就是工具本身，冲突时就是一个 `DuplicateToolError<名字>` 字符串字面量类型。工具对象当然不能赋值给一个字符串类型，于是报错，而错误信息里正好带着你写的那句话。

## 提示

- `ParamValue` 里，enum 的值类型可以用 `infer` 从 `values: readonly (infer V)[]` 中取出来
- `RequiredKeys` 用 2.4 节"映射类型 + 条件类型 + `[keyof T]`"的写法：值为 `never` 的键会从联合中消失
- 判断"optional 是 `true`"时，想想 `{ type: "string" }`（没有 optional）和 `{ type: "string"; optional: false }` 应该怎么归类
- `InferArgs` 可以拆成两个映射类型再交叉，最后用 `Prettify` 展开。如果结果带上了 `readonly`，想想映射类型什么时候会保留原来的修饰符（2.3 节）
- `defineTool` 需要三个类型参数，哪两个需要 `const`？
- `validateArgs` 判断"普通对象"时，别忘了 `typeof null === "object"`，数组也是对象
- `ToolByName` 用 `Extract`；`ResultOf` 用 `ReturnType`（它的约束是 `(...args: any) => any`，`AnyTool` 的 `execute` 满足吗？）
- 类型测试失败时，先看 2.8 节的 [读懂类型测试的失败信息](08-debugging-type-errors.md#读懂类型测试的失败信息)

## 做完之后

对照 [参考答案](../../solutions/02-advanced-types/project/tool-registry.ts)，然后想一想：

1. 参考答案的 `validateArgs` 用了一次 `as InferArgs<S>`，`createRegistry` 内部也有几次断言。逐个找出来，说说每一次是靠什么保证安全的。如果校验逻辑有 bug，类型系统能发现吗？
2. 现在参数只支持四种简单类型。如果要支持数组参数（`{ type: "array"; items: ParamSpec }`）或者嵌套对象，`ParamValue` 要怎么改？（提示：递归，2.4 节）
3. `dispatch` 返回的 `value` 是 `unknown`。为什么这里拿不到更精确的类型？（提示：`call.name` 是什么类型？）
4. 有些模型 API 要求工具名只能包含字母、数字、下划线和连字符。你能用模板字面量类型在编译期检查这一点吗？做得到多少，做不到多少？

## 和后面章节的关系

- **第 3 章** 调用真正的模型 API，`schemas()` 的结果会原样放进请求里，模型返回的工具调用就是这里的 `RawToolCall`
- **第 5 章** 用 Zod 替换手写的 `ParamSpec`，`InferArgs` 换成 `z.infer`
- **第 6 章** 写 agent 主循环：`dispatch` 的结果变成第 1 章的 `toolMessage`，追加进聊天记录，再交给模型

## 小结

- 一份数据，多种用途：参数描述在运行时生成 Schema、做校验，它的类型在编译期推导出参数类型
- `const` 类型参数保留字面量，让类型运算有东西可算
- 参数位置反过来比较，所以"任何函数"的参数类型是 `never`
- 类型安全的边界在校验处：校验之后的断言要有充分的测试
- 不可变的链式 API 让类型随着调用累积：`ToolRegistry<never>` → `ToolRegistry<A>` → `ToolRegistry<A | B>`
