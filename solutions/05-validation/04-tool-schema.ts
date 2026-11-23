/**
 * 练习 5-4 参考答案：给模型看的工具 schema
 */
import { z } from "zod";

export type JsonSchema = z.core.JSONSchema.JSONSchema;

export interface FunctionSchema {
  name: string;
  description: string;
  parameters: JsonSchema;
  strict?: boolean;
}

export interface StrictProblem {
  path: string;
  message: string;
}

const UNSUPPORTED = [
  "allOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "dependentRequired",
  "dependentSchemas",
] as const;

type Override = (ctx: { jsonSchema: JsonSchema }) => void;

function generate(schema: z.ZodType, override?: Override): JsonSchema {
  const { $schema: _ignored, ...parameters } = z.toJSONSchema(
    schema,
    override === undefined ? { io: "input" } : { io: "input", override },
  );
  if (parameters.type !== "object") {
    throw new Error("工具参数的根必须是 object");
  }
  return parameters;
}

export function toolParameters(schema: z.ZodType): JsonSchema {
  return generate(schema);
}

function checkName(name: string): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) {
    throw new Error(`工具名不合法：${name}`);
  }
}

export function defineFunction(
  name: string,
  description: string,
  schema: z.ZodType,
): FunctionSchema {
  checkName(name);
  return { name, description, parameters: toolParameters(schema) };
}

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walk(schema: JsonSchema, path: string, problems: StrictProblem[]): void {
  if (schema.type === "object") {
    if (schema.additionalProperties !== false) {
      problems.push({ path, message: "必须设置 additionalProperties: false" });
    }
    const required = new Set(schema.required ?? []);
    for (const key of Object.keys(schema.properties ?? {})) {
      if (!required.has(key)) {
        problems.push({ path, message: `${key} 必须出现在 required 里` });
      }
    }
  }
  for (const keyword of UNSUPPORTED) {
    if (keyword in schema) {
      problems.push({ path, message: `不支持 ${keyword}` });
    }
  }

  const visit = (child: unknown, childPath: string) => {
    if (isSchema(child)) {
      walk(child, childPath, problems);
    }
  };
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    visit(child, `${path}/properties/${key}`);
  }
  visit(schema.items, `${path}/items`);
  (schema.prefixItems ?? []).forEach((child, index) =>
    visit(child, `${path}/prefixItems/${index}`),
  );
  (schema.anyOf ?? []).forEach((child, index) => visit(child, `${path}/anyOf/${index}`));
  (schema.oneOf ?? []).forEach((child, index) => visit(child, `${path}/oneOf/${index}`));
  visit(schema.additionalProperties, `${path}/additionalProperties`);
  for (const [key, child] of Object.entries(schema.$defs ?? {})) {
    visit(child, `${path}/$defs/${key}`);
  }
}

export function strictProblems(schema: JsonSchema): StrictProblem[] {
  const problems: StrictProblem[] = [];
  if (schema.type !== "object") {
    problems.push({ path: "#", message: "根必须是 object" });
  }
  walk(schema, "#", problems);
  return problems;
}

const closeObjects: Override = ({ jsonSchema }) => {
  if (jsonSchema.type === "object" && jsonSchema.additionalProperties === undefined) {
    jsonSchema.additionalProperties = false;
  }
};

export function strictFunction(
  name: string,
  description: string,
  schema: z.ZodType,
): FunctionSchema {
  checkName(name);
  const parameters = generate(schema, closeObjects);
  const problems = strictProblems(parameters);
  if (problems.length > 0) {
    const lines = problems.map((problem) => `  ${problem.path}: ${problem.message}`);
    throw new Error([`${name} 不符合严格模式：`, ...lines].join("\n"));
  }
  return { name, description, parameters, strict: true };
}
