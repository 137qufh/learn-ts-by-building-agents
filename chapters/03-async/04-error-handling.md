# 3.4 错误处理

> 这一节要解决的问题：调用模型 API 时，可能断网、可能被限流（429）、可能服务器出错（500）、可能返回坏掉的 JSON；执行工具时，文件可能不存在；用户随时可能按 Ctrl+C。这些错误的处理方式各不相同：有的该重试，有的该告诉模型，有的该直接停下。怎么把它们区分开，又不漏掉任何一个？

示例代码：[examples/04-error-handling.ts](examples/04-error-handling.ts)

## 先分清两类错误

处理错误之前，先问一个问题：**这个失败是预料之中的吗？**

| 类型     | 例子                                             | 处理方式                                     |
| -------- | ------------------------------------------------ | -------------------------------------------- |
| 预料之中 | 文件不存在、参数校验失败、HTTP 429、模型拒绝回答 | 是业务的一部分：调用方应该逐一处理           |
| 预料之外 | 代码 bug、`undefined` 上读属性、内存不足         | 没法就地处理：让它冒泡到顶层，记录日志、退出 |

两类错误适合不同的工具：预料之外的错误用 **异常**（`throw`），让它一路向上传播；预料之中的错误，可以继续用异常，也可以 **作为返回值**（本节后半部分的 `Result`）。先从异常说起。

## Error 对象

`throw` 可以抛出任何值，但应该始终抛出 `Error`（或它的子类）。`Error` 带着几样有用的东西：

- `message`：错误信息
- `name`：错误的类型名，比如 `"Error"`、`"TypeError"`、`"SyntaxError"`
- `stack`：创建这个错误时的调用栈，调试时最有价值的信息。抛出字符串就没有它
- `cause`：导致这个错误的原始错误（下面会讲）

JavaScript 内置了几种常见的错误类：`TypeError`（类型不对，比如调用了不是函数的东西；`fetch` 遇到网络故障时也抛出它）、`RangeError`（值超出范围）、`SyntaxError`（`JSON.parse` 解析失败）、`AggregateError`（包含多个错误，3.3 节的练习用过）。

## 自定义错误类

调用模型 API 失败时，调用方需要知道 HTTP 状态码，才能决定要不要重试。这需要一个带着 `status` 的错误类型。

到目前为止我们还没用过 `class`。这里只介绍定义错误类需要的最少语法，其余的特性等用到时再介绍：

```ts
class ApiError extends Error {
  override readonly name = "ApiError";
  readonly status: number;

  constructor(status: number, message: string, options?: ErrorOptions) {
    super(message, options); // 必须先调用父类的构造函数，才能使用 this
    this.status = status;
  }

  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

const error = new ApiError(429, "请求太频繁");
error.status; // 429
error.retryable; // true
```

逐行看：

- `class ApiError extends Error`：定义一个类，**继承** `Error`。`ApiError` 的实例拥有 `Error` 的一切（`message`、`stack`……），再加上自己的东西
- `readonly status: number`：声明一个实例属性。`strict` 模式下，每个属性要么在声明处给出初始值（像下面的 `name`），要么在构造函数里赋值，否则会报错；`readonly` 表示赋值之后不能再修改
- `constructor`：用 `new ApiError(...)` 创建实例时执行的函数。子类的构造函数必须先调用 `super(...)`，也就是父类的构造函数
- `override readonly name = "ApiError"`：`Error` 本身就有 `name` 属性，这里覆盖它，让错误信息和日志里显示 `ApiError` 而不是 `Error`。`override` 关键字表示"我知道父类里有同名成员，是有意覆盖的"，本仓库开启了 `noImplicitOverride`，少了它会报错
- `get retryable()`：**getter**，用起来像属性（`error.retryable`），实际上每次读取时执行这个函数

> 你可能在别的代码里见过 `constructor(readonly status: number) {}` 这种"参数属性"的简写。它不是标准的 JavaScript 语法，Node.js 的类型剥离不支持它，所以本仓库开启的 `erasableSyntaxOnly` 会禁止它（[0.2 节](../00-setup/02-running-ts.md)）。老老实实地声明属性、在构造函数里赋值就好。

### 用 `instanceof` 区分错误

`catch` 到的错误是 `unknown`，`instanceof` 可以检查它是不是某个类的实例，并且会收窄类型：

```ts
function describe(error: unknown): string {
  if (error instanceof ApiError) {
    return `HTTP ${error.status}${error.retryable ? "（可以重试）" : ""}`; // error: ApiError
  }
  if (error instanceof Error) {
    return error.message; // error: Error
  }
  return String(error);
}
```

注意检查的顺序：`ApiError` 的实例同时也是 `Error` 的实例，所以更具体的类要先检查。

> `instanceof` 有一个已知的局限：如果项目里同一个库被安装了两份（不同版本），两份代码里的 `ApiError` 是两个不同的类，`instanceof` 会返回 `false`。所以很多库会额外提供 `isXxxError()` 这样的函数，或者检查 `name` 属性。

## `cause`：包装错误，但不丢掉原因

底层的错误信息往往太技术化，不适合直接展示；可是只抛一个新错误，又会丢掉排查问题需要的细节。`cause` 选项解决了这个矛盾：

```ts
function parseReply(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("模型返回的不是合法的 JSON", { cause: error });
  }
}
```

新错误说清楚了"在做什么的时候失败了"，原始的 `SyntaxError` 保存在 `cause` 里。Node.js 打印未捕获的错误时，会把 `cause` 链也一起打印出来。`cause` 的类型是 `unknown`，使用前同样要检查。

## fetch 的错误

第 3.10 节的项目会用 `fetch` 调用模型 API。它的错误行为需要特别记住：

- **网络层面的失败**（DNS 解析失败、连接被拒绝、连接中途断开）：`fetch` 返回的 Promise 被拒绝，错误是 `TypeError`，信息通常是 `fetch failed`，真正的原因在 `cause` 里
- **HTTP 错误**（404、429、500……）：`fetch` **不会** 拒绝！它正常兑现一个 `Response`，只是 `response.ok` 是 `false`。要自己检查 `response.ok` 或 `response.status`，再把它变成一个 `ApiError` 抛出
- **被取消**：拒绝的原因是 `AbortSignal` 的 `reason`，默认是一个 `name` 为 `"AbortError"` 的 `DOMException`（3.6 节）

第二点最容易出错：不检查 `response.ok`，就会把一个 500 错误页面当成正常的回复去解析。本节练习会实现从 HTTP 响应构造 `ApiError` 的函数。

## 预料之中的失败：Result

异常有一个根本的问题：**函数签名里看不出它会抛出什么。** `readFile(path): Promise<string>` 没有告诉你"文件不存在"时会发生什么，调用方很容易忘记处理。

2.1 节的练习实现过 `Result` 类型。把预料之中的失败作为返回值，失败就写进了类型里：

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

type ReadError =
  { kind: "not_found"; path: string } | { kind: "too_large"; path: string; bytes: number };

async function readFileTool(path: string): Promise<Result<string, ReadError>> {
  /* ... */
}
```

调用方拿到的是一个可辨识联合，不检查 `result.ok` 就拿不到 `value`。错误本身也是一个可辨识联合，可以用 `switch` 加穷尽性检查（1.6 节）确保每种错误都被处理：将来新增一种错误，所有没处理它的地方都会报错。

异步函数返回 `Promise<Result<T, E>>` 时，有两层"失败"：Result 里的 `error` 是预料之中的失败，Promise 被拒绝则意味着预料之外的错误（bug）。

### 什么时候用 Result，什么时候抛出

没有绝对的规则，下面是本课程采用的习惯：

- **调用方很可能要分情况处理** 的失败，用 Result。agent 里最典型的是 **工具执行的结果**：工具失败了不是程序的错误，而是要原样告诉模型的信息（"文件不存在"），模型会据此调整
- **调用方通常处理不了，只能向上传递** 的失败，用异常。比如 API 密钥错误（401），除了停下来告诉用户，没什么能做的
- **库的边界**：在调用第三方代码（`fetch`、`JSON.parse`）的地方，把它可能抛出的异常转换成你自己的错误类型或 Result，不要让内部细节泄漏到整个代码库

把"可能抛出"的异步操作转换成 Result 的函数非常常用：

```ts
async function attemptAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error), { cause: error }),
    };
  }
}
```

注意 `return { ok: true, value: await fn() }` 里的 `await`：少了它，`value` 就成了一个 Promise，而且 `fn` 的拒绝不会被这里的 `catch` 接住（3.3 节）。好在这种情况下类型对不上，TypeScript 会报错。

## 别让错误消失

最糟糕的错误处理，是让错误悄无声息地消失：

```ts
try {
  await saveTranscript();
} catch {
  // 什么都不做
}
```

如果确实可以忽略（比如删除一个本来就可能不存在的临时文件），写一行注释说明为什么。另外几个让错误消失的方式：

- **漂浮的 Promise**：调用 async 函数却不 `await`，也不 `.catch`（3.3 节）
- **`finally` 里写 `return`**：它会覆盖 `try` 里抛出的异常，异常就此消失。`finally` 只用来做清理
- **只打印 `error.message`**：丢掉了 `stack` 和 `cause`。记录日志时，把整个错误对象交给 `console.error`

最后一道防线是进程级别的事件：

```ts
process.on("unhandledRejection", (reason) => {
  console.error("未处理的拒绝：", reason);
  process.exit(1);
});
```

Node.js 默认就会在未处理的拒绝发生时打印错误并退出，这是对的：程序已经处于未知状态，继续运行可能更糟。上面的写法只是让你有机会先做些记录。

## 小结

- 先分清预料之中和预料之外的失败：前者是业务的一部分，后者让它冒泡
- 始终抛出 `Error` 或它的子类；用 `class XxxError extends Error` 携带额外的信息，记得 `override readonly name`
- 用 `instanceof` 区分错误，更具体的类先检查；包装错误时用 `cause` 保留原始原因
- `fetch` 只在网络故障时拒绝；HTTP 错误要自己检查 `response.ok`
- 调用方需要分情况处理的失败，用 `Result` 写进返回类型；不要让错误悄无声息地消失

## 练习

[exercises/03-async/04-api-errors.ts](../../exercises/03-async/04-api-errors.ts)：实现 `ApiError` 类、从 HTTP 响应构造它、判断错误是否值得重试，以及把错误链格式化成一行。运行 `pnpm ex 04-api-errors`。

下一节：[3.5 并发：Promise.all 和它的兄弟们](05-concurrency.md)
