/**
 * 练习 5-4：给模型看的工具 schema
 *
 * 课程：chapters/05-validation/04-json-schema.md
 * 运行：pnpm ex 04-tool-schema
 *
 * 第 2 章的 toSchema 手写了一个很小的 JSON Schema 子集。现在工具参数用 Zod 描述，
 * JSON Schema 交给 z.toJSONSchema 生成，你负责把它变成模型 API 要的样子，并检查它能不能用于严格模式。
 *
 * 1. toolParameters(schema)：生成工具参数的 JSON Schema
 *    - 模型产生的是 schema 的「输入」，所以用 io: "input"
 *    - 去掉 "$schema" 键（API 不需要它）
 *    - 根必须是 type: "object"，否则抛出 Error("工具参数的根必须是 object")
 *
 * 2. defineFunction(name, description, schema)：组装成 FunctionSchema
 *    - name 只能包含字母、数字、下划线和连字符，长度 1 到 64，否则抛出 Error(`工具名不合法：${name}`)
 *
 * 3. strictProblems(schema)：列出一份 JSON Schema 不符合 OpenAI 严格模式的地方
 *    规则（每条违反生成一个 StrictProblem，path 是 JSON Pointer 风格，根是 "#"）：
 *    - 根的 type 必须是 "object"                        → "根必须是 object"
 *    - 每个 type 为 "object" 的 schema：
 *        additionalProperties 必须是 false             → "必须设置 additionalProperties: false"
 *        properties 里的每个键都必须出现在 required 里 → `${键} 必须出现在 required 里`
 *    - 不能出现这些关键字：allOf、oneOf、not、if、then、else、dependentRequired、dependentSchemas
 *                                                       → `不支持 ${关键字}`
 *    问题的顺序：先报告当前 schema 自己的问题（按上面规则的顺序，关键字按上面列出的顺序），
 *    再递归检查子 schema，顺序是：
 *      properties 的每个值   → `${path}/properties/${键}`
 *      items（是对象时）     → `${path}/items`
 *      prefixItems 的每一项  → `${path}/prefixItems/${下标}`
 *      anyOf 的每一项        → `${path}/anyOf/${下标}`
 *      oneOf 的每一项        → `${path}/oneOf/${下标}`
 *      additionalProperties（是对象时）→ `${path}/additionalProperties`
 *      $defs 的每个值        → `${path}/$defs/${键}`
 *
 * 4. strictFunction(name, description, schema)：严格模式的 FunctionSchema
 *    - 和 defineFunction 一样，但每个没写 additionalProperties 的对象都补上 additionalProperties: false
 *      （提示：z.toJSONSchema 的 override 选项）
 *    - 再用 strictProblems 检查；有问题时抛出 Error，信息的第一行是 `${name} 不符合严格模式：`，
 *      后面每个问题一行：`  ${path}: ${message}`
 *    - 结果带上 strict: true
 */
import { z } from "zod";
import { todo } from "../todo.ts";

/** Zod 自带的 JSON Schema 类型：已知的关键字都是可选属性，再加一个 [k: string]: unknown 的索引签名。 */
export type JsonSchema = z.core.JSONSchema.JSONSchema;

/** 发给模型 API 的函数描述（OpenAI 的 tools[].function）。 */
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

export function toolParameters(schema: z.ZodType): JsonSchema {
  return todo("实现 toolParameters");
}

export function defineFunction(
  name: string,
  description: string,
  schema: z.ZodType,
): FunctionSchema {
  return todo("实现 defineFunction");
}

export function strictProblems(schema: JsonSchema): StrictProblem[] {
  return todo("实现 strictProblems");
}

export function strictFunction(
  name: string,
  description: string,
  schema: z.ZodType,
): FunctionSchema {
  return todo("实现 strictFunction");
}
