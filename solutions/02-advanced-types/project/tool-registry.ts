/**
 * 第 2 章项目参考答案：类型安全的工具注册表
 */

// ── 参数描述 ─────────────────────────────────────────────────────

export type ParamSpec =
  | { type: "string"; description?: string; optional?: boolean }
  | { type: "number"; description?: string; optional?: boolean }
  | { type: "boolean"; description?: string; optional?: boolean }
  | { type: "enum"; values: readonly string[]; description?: string; optional?: boolean };

export type ParamsSpec = Record<string, ParamSpec>;

// ── 第一部分：从参数描述推导参数类型 ──────────────────────────────

export type ParamValue<P extends ParamSpec> = P extends { type: "string" }
  ? string
  : P extends { type: "number" }
    ? number
    : P extends { type: "boolean" }
      ? boolean
      : P extends { type: "enum"; values: readonly (infer V)[] }
        ? V
        : never;

// 2.4 节的"映射类型 + 条件类型 + [keyof T]"：值为 never 的键会从联合中消失。
export type RequiredKeys<S extends ParamsSpec> = {
  [K in keyof S]: S[K] extends { optional: true } ? never : K;
}[keyof S];

export type OptionalKeys<S extends ParamsSpec> = Exclude<keyof S, RequiredKeys<S>>;

export type Prettify<T> = { [K in keyof T]: T[K] } & {};

// 必需的键和可选的键分成两个映射类型，交叉后用 Prettify 合并成一个对象类型。
// [K in RequiredKeys<S>] 遍历的不是 keyof S 本身，所以不会继承 const 推断带来的 readonly。
export type InferArgs<S extends ParamsSpec> = Prettify<
  { [K in RequiredKeys<S>]: ParamValue<S[K]> } & { [K in OptionalKeys<S>]?: ParamValue<S[K]> }
>;

// ── 第二部分：定义工具 ───────────────────────────────────────────

export interface Tool<N extends string, S extends ParamsSpec, R> {
  name: N;
  description: string;
  parameters: S;
  execute: (args: InferArgs<S>) => R;
}

/**
 * 任何工具都能赋值给它。execute 的参数写成 never：参数位置是反过来比较的，
 * (args: { city: string }) => R 能赋值给 (args: never) => unknown，因为 never 能赋值给任何类型。
 * 如果写成 Tool<string, ParamsSpec, unknown>，具体的工具反而赋值不过来（试试看错误信息）。
 */
export interface AnyTool {
  name: string;
  description: string;
  parameters: ParamsSpec;
  execute: (args: never) => unknown;
}

// const N：保留工具名的字面量；const S：保留 enum 的值和 optional: true 的字面量。
// execute 是上下文敏感的函数，TS 会先从 name 和 parameters 推断出 N 和 S，再用 InferArgs<S> 给 args 定类型。
export function defineTool<const N extends string, const S extends ParamsSpec, R>(
  tool: Tool<N, S, R>,
): Tool<N, S, R> {
  return tool;
}

// ── 第三部分：运行时校验 ─────────────────────────────────────────

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function validateArgs<S extends ParamsSpec>(
  spec: S,
  input: unknown,
): Validation<InferArgs<S>> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: ["参数必须是一个对象"] };
  }
  // 收窄到 object 之后还不能按字符串索引；转成 Record<string, unknown> 是安全的：
  // 我们只读取，并且每个值都当成 unknown 重新检查。
  const record = input as Record<string, unknown>;
  const errors: string[] = [];

  for (const [key, param] of Object.entries(spec)) {
    const value = record[key];
    if (value === undefined) {
      if (!param.optional) {
        errors.push(`缺少参数 "${key}"`);
      }
      continue;
    }
    const problem = checkValue(param, value);
    if (problem !== undefined) {
      errors.push(`参数 "${key}" ${problem}`);
    }
  }

  for (const key of Object.keys(record)) {
    if (!Object.hasOwn(spec, key)) {
      errors.push(`未知参数 "${key}"`);
    }
  }

  // 走到这里且没有错误，说明 input 的每个字段都符合 spec，但 TS 无法从上面的循环推出这一点。
  // 这是整个项目里最关键的一次断言：类型安全的边界就在这里，所以它必须有充分的测试。
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: record as InferArgs<S> };
}

function checkValue(param: ParamSpec, value: unknown): string | undefined {
  switch (param.type) {
    case "string":
    case "boolean":
      return typeof value === param.type ? undefined : `应该是 ${param.type}`;
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? undefined : "应该是 number";
    case "enum":
      return typeof value === "string" && param.values.includes(value)
        ? undefined
        : `应该是 ${param.values.map((v) => `"${v}"`).join(" | ")} 之一`;
  }
}

// ── 第四部分：生成给模型看的 JSON Schema ──────────────────────────

export interface JsonSchemaProperty {
  type: "string" | "number" | "boolean";
  enum?: string[];
  description?: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, JsonSchemaProperty>;
    required: string[];
    additionalProperties: false;
  };
}

export function toSchema(tool: AnyTool): ToolSchema {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];
  for (const [key, param] of Object.entries(tool.parameters)) {
    const property: JsonSchemaProperty =
      param.type === "enum" ? { type: "string", enum: [...param.values] } : { type: param.type };
    if (param.description !== undefined) {
      property.description = param.description;
    }
    properties[key] = property;
    if (!param.optional) {
      required.push(key);
    }
  }
  return {
    name: tool.name,
    description: tool.description,
    parameters: { type: "object", properties, required, additionalProperties: false },
  };
}

// ── 第五部分：注册表 ─────────────────────────────────────────────

export type ToolName<T extends AnyTool> = T["name"];

export type ToolByName<T extends AnyTool, N extends ToolName<T>> = Extract<T, { name: N }>;

export type ArgsOf<T extends AnyTool> = InferArgs<T["parameters"]>;

export type ResultOf<T extends AnyTool> = ReturnType<T["execute"]>;

export type DuplicateToolError<N extends string> = `工具 "${N}" 已经注册过了`;

export interface RawToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type DispatchResult =
  { id: string; ok: true; value: unknown } | { id: string; ok: false; error: string };

export interface ToolRegistry<T extends AnyTool> {
  register<U extends AnyTool>(
    tool: U["name"] extends ToolName<T> ? DuplicateToolError<U["name"]> : U,
  ): ToolRegistry<T | U>;
  names(): ToolName<T>[];
  has(name: string): name is ToolName<T>;
  call<N extends ToolName<T>>(name: N, args: ArgsOf<ToolByName<T, N>>): ResultOf<ToolByName<T, N>>;
  schemas(): ToolSchema[];
  dispatch(call: RawToolCall): DispatchResult;
}

export function createRegistry(): ToolRegistry<never> {
  return makeRegistry(new Map());
}

// 内部实现用一个普通的 Map<string, AnyTool>。类型安全由 ToolRegistry 接口在"边界"上保证，
// 实现内部用少量受控的断言把两者连起来：这是写类型安全的库时非常常见的结构。
function makeRegistry<T extends AnyTool>(tools: ReadonlyMap<string, AnyTool>): ToolRegistry<T> {
  function execute(tool: AnyTool, args: unknown): unknown {
    // AnyTool 的 execute 只接受 never：调用它必须断言。调用方保证 args 已经符合这个工具的参数。
    return tool.execute(args as never);
  }

  return {
    register(tool) {
      // tool 的类型是一个条件类型；运行时它一定是工具（错误分支只存在于类型层面）。
      const candidate = tool as AnyTool;
      if (tools.has(candidate.name)) {
        throw new Error(`工具 "${candidate.name}" 已经注册过了`);
      }
      return makeRegistry(new Map(tools).set(candidate.name, candidate));
    },

    names() {
      return [...tools.keys()];
    },

    has(name): name is ToolName<T> {
      return tools.has(name);
    },

    call(name, args) {
      const tool = tools.get(name);
      if (tool === undefined) {
        throw new Error(`未知工具 "${name}"`);
      }
      return execute(tool, args) as ReturnType<ToolByName<T, typeof name>["execute"]>;
    },

    schemas() {
      return [...tools.values()].map(toSchema);
    },

    dispatch(call) {
      const tool = tools.get(call.name);
      if (tool === undefined) {
        return { id: call.id, ok: false, error: `未知工具 "${call.name}"` };
      }
      let input: unknown;
      try {
        input = JSON.parse(call.arguments);
      } catch {
        return { id: call.id, ok: false, error: "参数不是合法的 JSON" };
      }
      const validation = validateArgs(tool.parameters, input);
      if (!validation.ok) {
        return { id: call.id, ok: false, error: validation.errors.join("；") };
      }
      try {
        return { id: call.id, ok: true, value: execute(tool, validation.value) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { id: call.id, ok: false, error: `工具执行失败：${message}` };
      }
    },
  };
}
