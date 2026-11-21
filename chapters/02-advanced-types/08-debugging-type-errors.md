# 2.8 读懂和调试复杂的类型错误

> 这一节要解决的问题：类型写得越高级，错误信息就越长、越难懂。一屏幕的报错从哪里看起？错误为什么报在这里，而不是真正出错的地方？类型算出来的结果不对时，怎么一步步找到原因？

示例代码：[examples/08-debugging-type-errors.ts](examples/08-debugging-type-errors.ts)

前七节教你怎么 **写** 类型。这一节教你怎么在类型 **不对** 的时候把它修好。这是从"会用 TypeScript"到"熟练使用 TypeScript"最关键的一步，值得反复回来看。

## 读错误信息：从最后一行读起

```ts
const fromModel = {
  role: "assistant" as const,
  content: "",
  toolCalls: [{ id: "call_1", name: "search", arguments: { query: "ts" } }],
};
const message: AssistantMessage = fromModel;
```

完整的错误是这样的：

```
error TS2322: Type '{ role: "assistant"; content: string; toolCalls: { id: string; name: string; arguments: { query: string; }; }[]; }' is not assignable to type 'AssistantMessage'.
  Types of property 'toolCalls' are incompatible.
    Type '{ id: string; name: string; arguments: { query: string; }; }[]' is not assignable to type 'ToolCall[]'.
      Type '{ id: string; name: string; arguments: { query: string; }; }' is not assignable to type 'ToolCall'.
        Types of property 'arguments' are incompatible.
          Type '{ query: string; }' is not assignable to type 'string'.
```

这种缩进的错误叫 **错误链**。TypeScript 从最外层开始比较，每深入一层就多缩进一级，一直走到真正不兼容的地方：

- **第一行** 告诉你出事的位置和"谁和谁不兼容"，但它往往太笼统
- **中间几行** 是路径：`toolCalls` → 数组元素 → `arguments`
- **最后一行** 是根因：`{ query: string }` 不能赋值给 `string`

所以读长错误的方法是：**先看第一行确认位置，然后直接跳到最后一行看根因，再用中间几行确认路径。** 这个例子的根因是：模型返回的工具参数是 JSON 字符串，而这里误把它当成了已解析的对象。

> 编辑器的悬停提示和 `tsc` 的输出内容相同。错误信息太长被截断时（类型里出现 `...`），可以运行 `pnpm typecheck`（做练习时用 `pnpm ex:types`）看完整的输出。

### 常见的错误代码

每个错误都有一个代码（`TS2322`）。认识几个最常见的，能帮你一眼判断问题的大方向。不认识的代码，直接搜索它，通常能找到解释和讨论。

| 代码            | 典型信息                                                     | 通常意味着                               |
| --------------- | ------------------------------------------------------------ | ---------------------------------------- |
| TS2322          | Type 'X' is not assignable to type 'Y'                       | 赋值、返回值的类型不对                   |
| TS2345          | Argument of type 'X' is not assignable to parameter of type  | 传给函数的参数类型不对                   |
| TS2339          | Property 'x' does not exist on type 'Y'                      | 访问了不存在的属性，常常是忘了先收窄     |
| TS2741          | Property 'x' is missing in type 'X' but required in type     | 少了必需的属性                           |
| TS2353 / TS2561 | Object literal may only specify known properties             | 对象字面量里有多余（常常是拼错）的属性   |
| TS18048         | 'x' is possibly 'undefined'                                  | 用之前没有排除 `undefined`               |
| TS7053          | Element implicitly has an 'any' type because expression...   | 用 `string` 去索引一个没有索引签名的对象 |
| TS2344          | Type 'X' does not satisfy the constraint 'Y'                 | 类型参数不满足 `extends` 约束            |
| TS2540 / TS4104 | Cannot assign to 'x' because it is a read-only property      | 修改了只读的属性或数组                   |
| TS2589          | Type instantiation is excessively deep and possibly infinite | 递归类型太深                             |
| TS2578          | Unused '@ts-expect-error' directive                          | 标了"这里应该报错"，实际没有报错         |

## 让错误报在正确的位置

错误报告的位置是 TypeScript **发现** 不兼容的地方，不一定是你 **犯错** 的地方：

```ts
const looseSpec = { name: "search", descripton: "搜索网页", parameters: {} };
// ……很多行之后……
register(looseSpec);
// ❌ Property 'description' is missing in type '{ name: string; descripton: string; parameters: {}; }'
//    but required in type 'ToolSpec'.
```

拼写错误发生在定义处，错误却报在使用处。如果使用处在另一个文件，或者这个对象被传了好几手，找起来就很费劲。

解决办法是 **尽早告诉 TypeScript 你的意图**，让检查在定义处就发生：

```ts
const checkedSpec = {
  name: "search",
  descripton: "搜索网页",
  // ❌ Object literal may only specify known properties, but 'descripton' does not exist in type 'ToolSpec'.
  //    Did you mean to write 'description'?
  parameters: {},
} satisfies ToolSpec;
```

同样的道理：

- **导出函数写上返回类型**（1.1 节的约定）：函数体返回了错误的形状时，错误报在函数里，而不是几十个调用方那里
- **复杂的数据先写类型再写值**，或者用 `satisfies`
- 泛型函数报错时，试着 **手动写出类型参数**（`fn<Foo>(...)`）。如果错误随之移动到了参数上，说明问题出在推断：TypeScript 推断出的类型参数和你以为的不一样

## 查看类型：悬停、拆分、Prettify

调试类型问题时，最重要的能力是 **看到 TypeScript 实际算出来的类型**。

**悬停** 是最直接的工具：把鼠标放在变量、类型名上，就能看到它的类型。

**拆分**：一个复杂的类型表达式结果不对时，把它拆成几个中间类型，逐个悬停：

```ts
interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}

// KeysOfType<Usage, number> 的结果是 "inputTokens" | "outputTokens" | undefined，拆开看每一步：
type Step1 = { [K in keyof Usage]: Usage[K] extends number ? K : never };
// { inputTokens: "inputTokens"; outputTokens: "outputTokens"; cachedTokens?: never }
type Step2 = Step1[keyof Usage]; // "inputTokens" | "outputTokens" | undefined
```

就像调试普通代码时在中间加 `console.log`。2.4 节讲过，`KeysOfType` 不加 `-?` 时遇到可选属性，结果里会混进一个 `undefined`。只看最终结果很难想到原因，拆开以后，悬停 `Step1` 就能看到 `cachedTokens?: never`：问号还在，原因一目了然。

**Prettify**：悬停一个由交叉类型、工具类型组成的类型时，编辑器往往只显示它的"写法"，而不是展开后的结构：

```ts
type WithDefaults = ToolSpec & { timeoutMs: number };
// 悬停显示：ToolSpec & { timeoutMs: number; }

type Prettify<T> = { [K in keyof T]: T[K] } & {};
type Shown = Prettify<WithDefaults>;
// 悬停显示：{ name: string; description: string; parameters: Record<string, unknown>; timeoutMs: number; }
```

`Prettify` 用一个映射类型把所有属性重新"抄"一遍，迫使 TypeScript 算出最终的结构。末尾的 `& {}` 不改变类型，只是让编辑器更倾向于展开显示。这个小工具在很多项目里都能看到，也叫 `Simplify`。

> 还有一个好用的地方：[TypeScript Playground](https://www.typescriptlang.org/play)。把有问题的类型复制进去，在某一行下方写 `//    ^?`（`^` 对准要查看的变量），Playground 会把那个位置的类型直接显示在代码里。分享链接给别人求助时也很方便。

## 读懂类型测试的失败信息

本章的类型练习用 Vitest 的 `expectTypeOf` 写断言。它的失败信息格式有点特别，需要专门说一下。

假设你在做练习 2-1，`ok` 写成了这样（忘了错误类型应该是 `never`）：

```ts
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
```

对应的断言和失败信息是：

```ts
expectTypeOf(ok(1)).toEqualTypeOf<Result<number, never>>();
```

```
Type 'Result<number, never>' does not satisfy the constraint '{ error: never; ok: boolean; value: never; }'.
  Property 'error' is missing in type '{ ok: true; value: number; }' but required in type '{ error: never; ok: boolean; value: never; }'.
```

先弄清楚这条信息在说什么：

- `expectTypeOf` 的原理是：根据 **实际** 类型（`ok(1)` 的类型）计算出一个约束，再检查你写在尖括号里的 **期望** 类型是否满足它。两者相等时一定满足；不相等时，约束会变成一个故意让检查失败的类型
- 所以 `Type '...'` 后面跟的是 **期望** 类型，也就是断言里写的 `Result<number, never>`
- 约束部分是 `expectTypeOf` 内部比较的产物，**不必逐字理解**。比较对象类型时，它有时会包含 `"Expected: boolean, Actual: never"` 这样的说明，值得找一找；而 `does not satisfy the constraint 'never'` 只是表示"不相等"，没有更多信息

最可靠的办法不是死读这条信息，而是 **直接看实际类型**：在编辑器里打开 `.test-d.ts`，把鼠标悬停在被测的表达式 `ok(1)` 上，看到 `Result<number, Error>`，再和期望的 `Result<number, never>` 一对比，问题就清楚了。

几个实用的技巧：

- 测试的名字（"ok(1) 是 Result<number, never>"）就是规格说明，先读它
- `pnpm ex` 的输出会去掉冒号，读起来费劲时运行 `pnpm ex:types`，看 `tsc` 的原始输出
- 断言里带 `// @ts-expect-error` 的测试，失败信息是 `Unused '@ts-expect-error' directive`：意思是"这里本应报错，但你的类型放过了它"，说明你的类型太宽松了

## 四种"奇怪"的错误

下面这几种错误，第一次遇到时几乎都会让人困惑。它们的信息和真正的原因之间隔着一层"TypeScript 是怎么想的"，知道了这一层，就很好解决。

### 参数类型是 never：关联的联合

```ts
interface ToolArgs {
  search: { query: string };
  get_weather: { city: string; days: number };
}
const handlers: { [K in keyof ToolArgs]: (args: ToolArgs[K]) => string } = {/* ... */};

type AnyCall =
  | { name: "search"; args: ToolArgs["search"] }
  | { name: "get_weather"; args: ToolArgs["get_weather"] };

function dispatchWrong(call: AnyCall): string {
  return handlers[call.name](call.args);
  // ❌ Argument of type '{ query: string; } | { city: string; days: number; }' is not assignable
  //    to parameter of type '{ city: string; days: number; } & { query: string; }'.
}
```

我们知道 `call.name` 和 `call.args` 是 **配对** 的：名字是 `"search"` 时，参数一定是 `{ query }`。但 TypeScript 是分别看这两个表达式的：

- `handlers[call.name]` 的类型是"`search` 的处理函数 **或** `get_weather` 的处理函数"
- 调用一个"函数 A 或函数 B"，传入的参数必须 **两个都能接受**，也就是参数类型的交叉 `{ city; days } & { query }`
- 而 `call.args` 是 `{ query } | { city; days }`，不满足交叉

如果两个参数类型完全冲突（比如一个是 `string`，一个是 `number`），交叉的结果就是 `never`，错误信息会变成 `Argument of type ... is not assignable to parameter of type 'never'`。看到"参数类型是 `never`"或者"参数类型是一个奇怪的交叉"，首先想到这个问题。2.6 节的事件监听表如果写成 `listeners[event] ?? []`，也会遇到它。

**修复**：把函数写成以"键"为类型参数的泛型，并且用映射类型生成那个联合：

```ts
type Call<K extends keyof ToolArgs = keyof ToolArgs> = {
  [P in K]: { name: P; args: ToolArgs[P] };
}[K];

function dispatch<K extends keyof ToolArgs>(call: Call<K>): string {
  return handlers[call.name](call.args); // ✅
}
```

现在 `handlers[call.name]` 的类型是 `(args: ToolArgs[K]) => string`，`call.args` 的类型是 `ToolArgs[K]`，两边用的是同一个 `K`，TypeScript 能看出它们是配对的。要点有两个：

1. 处理函数表用映射类型声明（`{ [K in keyof ToolArgs]: ... }`），这样按 `K` 索引时得到的是 `(args: ToolArgs[K]) => string`，而不是一个联合
2. 调用的联合也用"映射类型 + `[K]`"生成，而不是手写成联合

这个模式在 agent 代码里会反复出现：工具名和参数、事件名和载荷、消息类型和处理函数，都是"关联的联合"。章末项目的工具注册表就建立在它上面。

### Omit 压扁了联合

```ts
type StoredMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "tool"; toolCallId: string; content: string };

type NewMessageWrong = Omit<StoredMessage, "id">;
const wrong: NewMessageWrong = { role: "tool", toolCallId: "call_1", content: "晴" };
// ❌ Object literal may only specify known properties, and 'toolCallId' does not exist in type 'NewMessageWrong'.
```

错误说 `toolCallId` 不存在，可它明明在 `tool` 消息里。悬停 `NewMessageWrong` 就能看出原因：它是 `{ role: "user" | "tool"; content: string }`，一个对象，而不是联合。

回想 `Omit` 的定义：`Pick<T, Exclude<keyof T, K>>`。对联合取 `keyof`，得到的是所有成员 **共有** 的键（`id`、`role`、`content`），`toolCallId` 只属于其中一个成员，就这样丢了。

**修复**：让 `Omit` 分配到每个成员上，用的正是 2.4 节的分配式条件类型：

```ts
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewMessage = DistributiveOmit<StoredMessage, "id">;
// { role: "user"; content: string } | { role: "tool"; toolCallId: string; content: string }
```

`T extends unknown` 永远成立，它唯一的作用就是触发分配。同样的问题也会发生在 `Pick`、`keyof` 以及任何对联合使用映射类型的地方。**对可辨识联合做类型变换时，先想一想要不要分配。**

### could be instantiated with a different subtype

```ts
function createWrong<T extends { id: string }>(): T {
  return { id: "msg_1" };
  // ❌ Type '{ id: string; }' is not assignable to type 'T'.
  //    '{ id: string; }' is assignable to the constraint of type 'T', but 'T' could be instantiated
  //    with a different subtype of constraint '{ id: string; }'.
}
```

第二行说得很清楚，只是需要翻译一下："你返回的东西满足约束 `{ id: string }`，但 `T` 可能是约束的某个更具体的子类型"。调用方完全可以写 `createWrong<{ id: string; role: "user" }>()`，而这个函数根本造不出 `role`。

遇到它，通常说明泛型用错了地方：**返回值和输入没有关系时，就不该用类型参数**（2.1 节的"类型参数至少出现两次"）。直接写成 `function createId(): { id: string }` 即可。

### Type instantiation is excessively deep

递归类型（2.4、2.6 节）每展开一层，TypeScript 都要计算一次。为了防止无限递归卡死编译器，它设置了深度上限，超过时报 TS2589。

- **尾递归**（递归调用是条件类型某个分支的全部结果，例如 `Repeat<S, N, [...Acc, S]>`）可以递归大约 1000 层
- **非尾递归**（递归结果还要再加工，例如 `[unknown, ...Countdown<...>]`）只有几十层

遇到这个错误：先检查递归是否真的有终止条件；如果有，试着改写成尾递归（把中间结果放进一个累加器类型参数 `Acc` 里）；再不行，就说明这个计算不适合放在类型层面，换成运行时代码加简单的类型。

## 写类型时就让错误好懂

最后，换个角度：你写的类型，别人（以及几个月后的你）也要读它的错误信息。

- **给中间类型起名字**。`Pick<Required<Omit<...>>>` 出错时，错误信息里会出现整串表达式；起了名字，错误里出现的就是 `ResolvedRequest`
- **约束写在最外层**。`<K extends keyof T>` 让错误在调用处立刻出现，并且信息清楚；把检查藏在条件类型深处，错误只会表现为某个地方变成了 `never`
- **需要时自定义错误信息**。条件类型的"失败"分支可以返回一个描述问题的字符串字面量类型：

```ts
type NoDuplicate<Name extends string, Existing extends string> = Name extends Existing
  ? `工具 "${Name}" 已经注册过了`
  : Name;

addTool(["search"], "search");
// ❌ Argument of type '"search"' is not assignable to parameter of type '"工具 \"search\" 已经注册过了"'.
```

错误信息里直接写着原因。章末项目会用这个技巧防止重复注册工具。

## 小结

- 长错误从最后一行读根因，第一行确认位置，中间几行确认路径
- 错误报在发现问题的地方，不一定是犯错的地方：用返回类型标注和 `satisfies` 把检查提前到定义处
- 悬停、拆成中间类型、`Prettify`、TypeScript Playground 的 `^?` 都能帮你看到实际算出的类型
- 类型测试失败时，报错的是期望类型；最可靠的办法是悬停被测表达式，直接对比实际类型和期望类型
- 参数类型变成 `never` 或交叉：关联的联合，用"以键为类型参数的泛型 + 映射类型"修复
- `Omit` 等映射类型会压扁联合，用分配式条件类型修复
- "could be instantiated with a different subtype"：返回值与输入无关时不要用泛型
- 递归太深：改成尾递归，或者把计算移到运行时

## 练习

[exercises/02-advanced-types/08-fix-the-types.ts](../../exercises/02-advanced-types/08-fix-the-types.ts)：这道题不是从零写，而是修 bug。文件里的类型都能通过编译，但都有问题，类型测试会告诉你哪里不对。用这一节的方法找到原因并修好它们。运行 `pnpm ex 08-fix-the-types`。

下一节：[2.9 章末项目：类型安全的工具注册表](09-project-tool-registry.md)
