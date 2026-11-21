# 2.2 keyof、typeof 与索引访问类型

> 这一节要解决的问题：怎么从已有的类型（甚至已有的值）里"取出"新的类型，而不是把同样的信息再手写一遍？怎么写一个函数，让它的参数只能是某个对象的键，返回值的类型随键而变？

示例代码：[examples/02-keyof-and-indexed-access.ts](examples/02-keyof-and-indexed-access.ts)

从这一节开始，我们要学习 **类型运算**：用已有的类型计算出新的类型。本节的三个运算符是后面所有内容的基础。

## `typeof`：从值得到类型

```ts
const DEFAULT_SETTINGS = {
  model: "gpt-5",
  temperature: 0.7,
  maxTokens: 1024,
  stream: true,
};

type Settings = typeof DEFAULT_SETTINGS;
// { model: string; temperature: number; maxTokens: number; stream: boolean; }
```

`typeof` 在两种位置有两种完全不同的含义：

- 在 **值** 的位置（普通代码里），它是 JavaScript 的运算符，在运行时返回 `"object"`、`"string"` 这样的字符串。1.6 节用它做过类型收窄
- 在 **类型** 的位置（`type X = ...` 的右边、`:` 后面），它是 TypeScript 的运算符，在编译期取出一个变量的类型

什么时候用？当一份数据已经以值的形式存在（配置、常量表），用 `typeof` 得到它的类型，这样值和类型永远同步，不会出现"改了值忘了改类型"。反过来，如果类型本身就是你想表达的"规格"（比如 API 返回什么），那就先写类型，再让值去满足它。

## `keyof`：所有键的联合

```ts
type SettingKey = keyof Settings; // "model" | "temperature" | "maxTokens" | "stream"

const key: SettingKey = "maxTokens"; // ✅
const wrongKey: SettingKey = "max_tokens";
// ❌ Type '"max_tokens"' is not assignable to type '"maxTokens" | "model" | "stream" | "temperature"'. Did you mean '"maxTokens"'?
```

`keyof T` 得到 `T` 所有键组成的字面量联合。注意错误信息里，TypeScript 把 `keyof Settings` 展开成了具体的联合（成员顺序可能和你写的不同），还猜出了你想写的是哪个。

## 索引访问类型：`T[K]`

用和读取属性一样的方括号语法，可以取出属性的 **类型**：

```ts
type Temperature = Settings["temperature"]; // number
type ModelOrStream = Settings["model" | "stream"]; // string | boolean
type SettingValue = Settings[keyof Settings]; // string | number | boolean
```

- 方括号里放一个联合，得到的是对应属性类型的联合
- `T[keyof T]` 是"所有属性值的类型"，常见到有人给它起名叫 `ValueOf<T>`
- 类型位置只能用方括号，不能用点：`Settings.temperature` 是错的

嵌套的类型可以一层层取出来。外部 API 的响应类型往往是一大块嵌套结构，这样就不必为每一层都单独起名：

```ts
interface ChatResponse {
  choices: { message: { role: "assistant"; content: string }; finishReason: string }[];
  usage: { inputTokens: number; outputTokens: number };
}

type Choice = ChatResponse["choices"][number]; // 数组元素的类型
type Usage = ChatResponse["usage"];
```

`[number]` 在 [1.5 节](../01-basics/05-literal-types.md) 出现过：用任意数字下标去取数组元素，得到的就是元素类型。

## 泛型 + keyof：最常用的组合

```ts
function getSetting<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const maxTokens = getSetting(DEFAULT_SETTINGS, "maxTokens"); // number
const stream = getSetting(DEFAULT_SETTINGS, "stream"); // boolean
getSetting(DEFAULT_SETTINGS, "maxToken"); // ❌ 拼错的键当场报错，编辑器还能自动补全
```

逐个拆开看：

- `T` 从第一个参数推断，是对象的类型
- `K extends keyof T`：`K` 必须是 `T` 的某个键。因为约束里引用了 `T`，`K` 的取值范围随 `obj` 而变
- 返回 `T[K]`：`K` 从第二个参数推断为字面量类型 `"maxTokens"`，于是返回类型就是 `T["maxTokens"]`，即 `number`

这是 TypeScript 里最值得记住的模式之一。如果把参数写成 `key: string`，TypeScript 就不让你用它来索引对象了：

```ts
function getLoose(obj: Settings, key: string): unknown {
  return obj[key];
  // ❌ Element implicitly has an 'any' type because expression of type 'string'
  //    can't be used to index type '{ model: string; ... }'.
}
```

错误信息的意思是：任意字符串不一定是 `Settings` 的键，读出来的东西没有确定的类型，只能是 `any`，而严格模式不允许隐式的 `any`。

同样的思路可以约束"值的类型要和键对应"：

```ts
function withSetting<T, K extends keyof T>(obj: T, key: K, value: T[K]): T {
  return { ...obj, [key]: value };
}

withSetting(DEFAULT_SETTINGS, "temperature", 0); // ✅
withSetting(DEFAULT_SETTINGS, "temperature", "low"); // ❌ Argument of type 'string' is not assignable to parameter of type 'number'.
```

## `keyof typeof`：从常量表得到键

把 `typeof` 和 `keyof` 组合起来，可以从一张常量表直接得到"合法名字"的联合：

```ts
const PROVIDERS = {
  openai: { baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-5" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", defaultModel: "claude-sonnet-4-5" },
} as const;

type ProviderName = keyof typeof PROVIDERS; // "openai" | "anthropic"
type AnthropicDefault = (typeof PROVIDERS)["anthropic"]["defaultModel"]; // "claude-sonnet-4-5"

function baseUrlOf(provider: ProviderName): string {
  return PROVIDERS[provider].baseUrl;
}
```

想支持一个新的供应商？只需要往表里加一行，`ProviderName` 自动更新，所有用到它的地方都会得到检查。`as const` 让表里的字符串保持字面量类型（[1.5 节](../01-basics/05-literal-types.md)），所以 `AnthropicDefault` 是 `"claude-sonnet-4-5"` 而不只是 `string`。

> `keyof typeof PROVIDERS` 要从右往左读：先用 `typeof` 拿到值的类型，再用 `keyof` 取出键。`(typeof PROVIDERS)["anthropic"]` 里的括号不是必需的（不加括号也会按同样的方式解析），但加上更清楚，Prettier 也会自动加上。

## 为什么 `Object.keys` 返回 `string[]`

学了 `keyof` 以后，几乎每个人都会问：`Object.keys(obj)` 为什么不返回 `(keyof T)[]`？

```ts
interface Point {
  x: number;
  y: number;
}

const point3d = { x: 1, y: 2, z: 3 };
const p: Point = point3d; // ✅ 结构类型：多出来的 z 不影响赋值
Object.keys(p); // [ 'x', 'y', 'z' ]
```

答案就在 [1.2 节](../01-basics/02-objects-and-interfaces.md) 讲的结构类型里：一个类型为 `Point` 的值，在运行时可能带着更多的属性。TypeScript 只能保证"至少有 `x` 和 `y`"，不能保证"只有 `x` 和 `y`"。如果 `Object.keys` 返回 `("x" | "y")[]`，下面这个函数就会在不报错的情况下算错：

```ts
function sumCoordinates(point: Point): number {
  let sum = 0;
  for (const k of Object.keys(point)) {
    sum += point[k]; // ❌ TS 不允许：k 只是 string
  }
  return sum;
}
```

如果绕过检查，`sumCoordinates(p)` 会返回 `6`，把本不该存在的 `z` 也加了进去。

正确的做法是 **遍历你自己列出的键**，而不是运行时碰巧存在的键：

```ts
const POINT_KEYS = ["x", "y"] as const satisfies readonly (keyof Point)[];

function sumKnown(point: Point): number {
  let sum = 0;
  for (const k of POINT_KEYS) {
    sum += point[k]; // k: "x" | "y"
  }
  return sum;
}
```

`satisfies` 保证列表里的每个名字都真的是 `Point` 的键，拼错会报错。

如果你能确定对象没有多余的键（例如它是你自己刚刚用字面量创建的），写 `Object.keys(obj) as (keyof T)[]` 也是可以接受的。这是一个 **有根据的** 断言：你比 TypeScript 多知道一件事，并且愿意为它负责。

## 索引签名的 keyof

```ts
type PriceKey = keyof Record<string, number>; // string
type DictKey = keyof { [key: string]: number }; // string | number
```

第二个结果看起来奇怪，但它反映了 JavaScript 的真实行为：对象的键在运行时都是字符串，`obj[1]` 和 `obj["1"]` 是同一个属性，所以用数字索引字符串索引签名也是允许的。

这带来一个后面会遇到的细节：在泛型里，`keyof T` 不一定只是字符串，还可能包含 `number` 和 `symbol`。所以需要"键一定是字符串"时（比如拼接成新的字符串），会看到 `K & string` 或 `Extract<keyof T, string>` 这样的写法，[2.6 节](06-template-literal-types.md) 会用到。

## 小结

- 类型位置的 `typeof` 从值得到类型；值位置的 `typeof` 是 JavaScript 运算符
- `keyof T` 是所有键的联合；`T[K]` 取出属性的类型，`T[keyof T]` 是所有值类型的联合，`T[number]` 是数组元素类型
- `<T, K extends keyof T>(obj: T, key: K): T[K]` 是让"键"和"值的类型"关联起来的标准写法
- `keyof typeof 常量表` 让合法名字的联合和数据保持同步
- `Object.keys` 返回 `string[]` 是因为结构类型允许多余属性；遍历自己列出的键，或者在有把握时才断言

## 练习

[exercises/02-advanced-types/02-settings.ts](../../exercises/02-advanced-types/02-settings.ts)：为模型配置和供应商表写类型安全的读取、修改和比较函数。运行 `pnpm ex 02-settings`。

下一节：[2.3 映射类型](03-mapped-types.md)
