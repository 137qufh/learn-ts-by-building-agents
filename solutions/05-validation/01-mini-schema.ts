/**
 * 练习 5-1 参考答案：自己写一个迷你 schema 库
 */

export type Path = (string | number)[];

export interface Issue {
  path: Path;
  message: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

export interface Schema<T> {
  readonly optional: boolean;
  parse(input: unknown, path?: Path): ParseResult<T>;
}

export interface OptionalSchema<T> extends Schema<T | undefined> {
  readonly optional: true;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

export function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  return typeof value;
}

function fail(path: Path, message: string): { ok: false; issues: Issue[] } {
  return { ok: false, issues: [{ path, message }] };
}

/** 基本类型的 schema 都长一个样：检查一下，通过就原样返回。 */
function primitive<T>(name: string, check: (input: unknown) => input is T): Schema<T> {
  return {
    optional: false,
    parse(input, path = []) {
      return check(input)
        ? { ok: true, value: input }
        : fail(path, `期望 ${name}，收到 ${typeName(input)}`);
    },
  };
}

export function string(): Schema<string> {
  return primitive("string", (input) => typeof input === "string");
}

export function number(): Schema<number> {
  // NaN 和 Infinity 的 typeof 也是 "number"，但它们不是 JSON 里能出现的数字，几乎总是 bug
  return primitive(
    "number",
    (input): input is number => typeof input === "number" && Number.isFinite(input),
  );
}

export function boolean(): Schema<boolean> {
  return primitive("boolean", (input) => typeof input === "boolean");
}

export function literal<const V extends string | number | boolean>(expected: V): Schema<V> {
  return primitive(JSON.stringify(expected), (input): input is V => input === expected);
}

export function optional<T>(schema: Schema<T>): OptionalSchema<T> {
  return {
    optional: true,
    parse(input, path = []) {
      return input === undefined ? { ok: true, value: undefined } : schema.parse(input, path);
    },
  };
}

export function array<T>(item: Schema<T>): Schema<T[]> {
  return {
    optional: false,
    parse(input, path = []) {
      if (!Array.isArray(input)) {
        return fail(path, `期望 array，收到 ${typeName(input)}`);
      }
      const value: T[] = [];
      const issues: Issue[] = [];
      input.forEach((element: unknown, index) => {
        const result = item.parse(element, [...path, index]);
        if (result.ok) {
          value.push(result.value);
        } else {
          issues.push(...result.issues); // 不在第一个错误处停下：一次把问题全部报告出来
        }
      });
      return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
    },
  };
}

export type Shape = Record<string, Schema<unknown>>;

type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type InferShape<S extends Shape> = Prettify<
  { [K in keyof S as S[K] extends OptionalSchema<unknown> ? never : K]: Infer<S[K]> } & {
    [K in keyof S as S[K] extends OptionalSchema<unknown> ? K : never]?: Exclude<
      Infer<S[K]>,
      undefined
    >;
  }
>;

export function object<S extends Shape>(shape: S): Schema<InferShape<S>> {
  return {
    optional: false,
    parse(input, path = []) {
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return fail(path, `期望 object，收到 ${typeName(input)}`);
      }
      const record = input as Record<string, unknown>;
      const value: Record<string, unknown> = {};
      const issues: Issue[] = [];
      for (const [key, schema] of Object.entries(shape)) {
        const result = schema.parse(record[key], [...path, key]);
        if (!result.ok) {
          issues.push(...result.issues);
        } else if (result.value !== undefined) {
          value[key] = result.value; // 可选属性没有值时不创建这个键（exactOptionalPropertyTypes）
        }
      }
      // 只复制 shape 里列出的键：多余的键被丢掉，下游代码不会看到没校验过的数据
      return issues.length === 0
        ? { ok: true, value: value as InferShape<S> } // 每个键都校验过了，这里的断言是安全的
        : { ok: false, issues };
    },
  };
}

export function union<const S extends readonly Schema<unknown>[]>(
  ...options: S
): Schema<Infer<S[number]>> {
  return {
    optional: false,
    parse(input, path = []) {
      for (const option of options) {
        const result = option.parse(input, path);
        if (result.ok) {
          return { ok: true, value: result.value as Infer<S[number]> };
        }
      }
      return fail(path, "不符合任何一种情况");
    },
  };
}

export function formatIssues(issues: readonly Issue[]): string {
  return issues
    .map(({ path, message }) => `${path.length === 0 ? "(根)" : path.join(".")}: ${message}`)
    .join("\n");
}
