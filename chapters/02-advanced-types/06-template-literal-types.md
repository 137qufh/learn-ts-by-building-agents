# 2.6 模板字面量类型

> 这一节要解决的问题：agent 代码里有大量"有格式的字符串"：`"tool:start"` 这样的事件名、`"github__create_issue"` 这样带命名空间的工具名、API 返回的 `finish_reason` 这样的字段名。怎么让类型系统理解这些字符串的结构？

示例代码：[examples/06-template-literal-types.ts](examples/06-template-literal-types.ts)

## 基本用法

1.5 节见过一次：

```ts
type ToolCallId = `call_${string}`;

const id: ToolCallId = "call_8f2a"; // ✅
const badId: ToolCallId = "8f2a"; // ❌ Type '"8f2a"' is not assignable to type '`call_${string}`'.
```

**模板字面量类型** 的语法和 JavaScript 的模板字符串一样，只是 `${}` 里放的是类型。`` `call_${string}` `` 表示"以 `call_` 开头、后面是任意字符串"。`${}` 里可以放 `string`、`number`、`boolean`、`bigint`、字面量类型，以及它们的联合。

## 联合会被展开成所有组合

```ts
type Subject = "model" | "tool";
type Phase = "start" | "end" | "error";
type AgentEventName = `${Subject}:${Phase}`;
// "model:start" | "model:end" | "model:error" | "tool:start" | "tool:end" | "tool:error"
```

两个联合放进同一个模板，得到的是它们的 **笛卡尔积**：每种组合都有。这是生成一组相关名字最简洁的方式。注意组合的数量是相乘的，几个大联合放在一起，很快就会变成成千上万个成员，拖慢类型检查。

## 内置的大小写转换

TypeScript 内置了四个处理字符串字面量类型的工具：`Uppercase`、`Lowercase`、`Capitalize`（首字母大写）、`Uncapitalize`（首字母小写）。

```ts
type Loud = Uppercase<"stop">; // "STOP"
type HandlerName = `on${Capitalize<"toolStart">}`; // "onToolStart"
```

它们是编译器内置实现的，在类型定义里看到的是 `intrinsic`（"内置"）这个关键字，没法用普通的类型写出来。

## 类型安全的事件

把事件名作为一个接口的键，载荷作为值，就能让"事件名"和"载荷类型"一一对应：

```ts
interface AgentEvents {
  "model:start": { model: string };
  "tool:start": { name: string; args: unknown };
  "tool:end": { name: string; durationMs: number };
}

type Listener<E extends keyof AgentEvents> = (payload: AgentEvents[E]) => void;

function on<E extends keyof AgentEvents>(event: E, listener: Listener<E>): void {
  /* ... */
}
function emit<E extends keyof AgentEvents>(event: E, payload: AgentEvents[E]): void {
  /* ... */
}

on("tool:end", (payload) => console.log(payload.durationMs)); // payload 的类型自动推断
emit("tool:end", { name: "search", duration: 120 });
// ❌ Object literal may only specify known properties, but 'duration' does not exist in type
//    '{ name: string; durationMs: number; }'. Did you mean to write 'durationMs'?
```

这里其实没有用到模板字面量类型，用的是 2.2 节的 `K extends keyof T` 和 `T[K]`。之所以放在这里，是因为它和模板字面量类型常常一起出现：事件名本身是有格式的字符串，而 `keyof AgentEvents` 让 TypeScript 把它们当成一个封闭的集合来检查。

> 实现 `on` 时，存放监听函数的表怎么声明大有讲究，一种看似自然的写法会得到一个奇怪的 `never` 错误。示例代码里用的是正确的写法，原因见 [2.8 节](08-debugging-type-errors.md#参数类型是-never关联的联合)。

## 用 infer 解析字符串

模板字面量类型可以出现在条件类型的 `extends` 里，配合 `infer` 从字符串中提取片段。

很多 MCP 客户端（第 7 章）会把工具名写成 `服务器__工具` 的形式，避免不同服务器的同名工具冲突。用类型把它拆开：

```ts
type SplitToolName<N extends string> = N extends `${infer Server}__${infer Tool}`
  ? { server: Server; tool: Tool }
  : never;

type Parsed = SplitToolName<"github__create_issue">; // { server: "github"; tool: "create_issue" }
type Nested = SplitToolName<"a__b__c">; // { server: "a"; tool: "b__c" }
type NoServer = SplitToolName<"search">; // never
```

匹配规则：**紧跟着字面量的 `infer` 会匹配尽可能短的内容**，也就是匹配到第一次出现的 `__` 为止，剩下的全部交给最后一个 `infer`。所以 `"a__b__c"` 被拆成 `"a"` 和 `"b__c"`。

## 递归：snake_case 转 camelCase

OpenAI 等 API 返回的字段名是 `finish_reason`、`prompt_tokens` 这样的 snake_case，而 TypeScript 代码习惯用 camelCase。用递归的模板字面量类型可以描述这个转换：

```ts
type CamelCase<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : S;

type C1 = CamelCase<"finish_reason">; // "finishReason"
type C2 = CamelCase<"prompt_tokens_details">; // "promptTokensDetails"
```

每次在第一个 `_` 处切开，把后半部分递归转换后首字母大写，直到没有 `_` 为止。再配合 2.3 节的键重映射，就能转换整个对象的字段名：

```ts
type CamelizeKeys<T> = { [K in keyof T as K extends string ? CamelCase<K> : K]: T[K] };

interface RawUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
type Usage = CamelizeKeys<RawUsage>;
// { promptTokens: number; completionTokens: number; totalTokens: number }
```

`K extends string ? ... : K`：只转换字符串键，`number`、`symbol` 键原样保留。

## 从路径模板中提取参数

```ts
type PathParams<P extends string> = P extends `${string}:${infer Param}/${infer Rest}`
  ? Param | PathParams<`/${Rest}`>
  : P extends `${string}:${infer Param}`
    ? Param
    : never;

type Params = PathParams<"/sessions/:sessionId/messages/:messageId">; // "sessionId" | "messageId"
```

有了它，`buildPath` 可以要求调用方提供路径里的每一个参数，少一个就报错：

```ts
function buildPath<P extends string>(pattern: P, params: Record<PathParams<P>, string>): string {
  /* ... */
}

buildPath("/sessions/:sessionId/messages/:messageId", { sessionId: "s1" });
// ❌ Property 'messageId' is missing in type '{ sessionId: string; }'
//    but required in type 'Record<"messageId" | "sessionId", string>'.
```

很多 Web 框架（比如 Hono）就是用这种技术让路由参数有类型的。

## 解析数字：`infer N extends number`

2.5 节学过给 `infer` 加约束。约束为 `number` 时，TypeScript 会尝试把匹配到的字符串解析成数字字面量：

```ts
type ParseInt<S extends string> = S extends `${infer N extends number}` ? N : never;

type MaxTokens = ParseInt<"4096">; // 4096
type NotNumber = ParseInt<"many">; // never
```

## 别忘了运行时

模板字面量类型描述的是 **你代码里写出来的字符串**。模型返回的工具名、用户输入的路径、API 返回的字段，在编译期都只是 `string`，类型系统帮不了你，仍然需要运行时检查。一个常见的做法是写一个函数，在运行时验证格式，并用类型守卫把 `string` 收窄成模板字面量类型：

```ts
function isToolCallId(value: string): value is ToolCallId {
  return value.startsWith("call_");
}
```

反过来，代码里用模板字符串拼出来的值，类型默认只是 `string`。在模板字符串后面加上 `as const`，TypeScript 才会给它一个模板字面量类型：

```ts
function namespaced<S extends string, T extends string>(server: S, tool: T) {
  return `${server}__${tool}` as const; // 返回类型是 `${S}__${T}`
}

const name = namespaced("github", "create_issue"); // "github__create_issue"
```

本节的练习就是这样：类型描述格式，函数在运行时生成或检查格式，两者保持一致。

## 小结

- `` `前缀${string}` `` 描述有格式的字符串；联合放进模板会展开成所有组合
- `Uppercase`、`Lowercase`、`Capitalize`、`Uncapitalize` 是内置的大小写转换
- `extends` 里的模板 + `infer` 可以解析字符串；紧跟字面量的 `infer` 匹配尽可能短的内容
- 递归 + 键重映射可以转换整个对象的字段名，例如 snake_case 转 camelCase
- `infer N extends number` 能把数字字符串解析成数字字面量
- 外部传入的字符串只是 `string`：用类型守卫在运行时检查格式

## 练习

[exercises/02-advanced-types/06-naming.ts](../../exercises/02-advanced-types/06-naming.ts)：处理带命名空间的工具名，把 API 返回的 snake_case 字段转换成 camelCase。运行 `pnpm ex 06-naming`。

下一节：[2.7 内置工具类型](07-utility-types.md)
