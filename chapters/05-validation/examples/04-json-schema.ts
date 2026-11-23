// 5.4 JSON Schema：给模型看的 schema
// 运行：pnpm tsx chapters/05-validation/examples/04-json-schema.ts

import { z } from "zod";

const show = (value: unknown) => console.log(JSON.stringify(value));

// ── 1. 从 Zod schema 生成 JSON Schema ────────────────────────────────
const ReadFileArgs = z.object({
  path: z.string().min(1).describe("相对于工作目录的文件路径"),
  maxLines: z.number().int().min(1).max(2000).optional().describe("最多读取多少行"),
});
show(z.toJSONSchema(ReadFileArgs));
// {"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"path":{"type":"string","minLength":1,"description":"相对于工作目录的文件路径"},"maxLines":{"description":"最多读取多少行","type":"integer","minimum":1,"maximum":2000}},"required":["path"],"additionalProperties":false}

// ── 2. 输入还是输出？模型产生的是 schema 的「输入」 ──────────────────
const SearchArgs = z.object({
  query: z.string(),
  limit: z.number().int().min(1).max(50).default(10),
});
show(z.toJSONSchema(SearchArgs).required); //                  ["query","limit"]  ← 输出里 limit 一定有
show(z.toJSONSchema(SearchArgs, { io: "input" }).required); // ["query"]          ← 输入里 limit 可以不传

// 转换只有输入一侧能描述
const Csv = z.string().transform((text) => text.split(","));
try {
  z.toJSONSchema(Csv);
} catch (error) {
  console.log((error as Error).message); // Transforms cannot be represented in JSON Schema
}
show(z.toJSONSchema(Csv, { io: "input" })); // {"$schema":"…","type":"string"}

// ── 3. 表达不了的东西会悄悄丢掉 ──────────────────────────────────────
const Range = z.object({ min: z.number(), max: z.number() }).refine((r) => r.min <= r.max);
show(z.toJSONSchema(Range).properties); // {"min":{"type":"number"},"max":{"type":"number"}}  ← refine 不见了
show(z.toJSONSchema(z.string().brand<"ApiKey">())); // {"$schema":"…","type":"string"}      ← 品牌只存在于类型里
show(z.toJSONSchema(z.number().int())); // 没写范围的 int 会带上「安全整数」的范围
// {"$schema":"…","type":"integer","minimum":-9007199254740991,"maximum":9007199254740991}

// 根本没有对应物的类型（Date、bigint、函数……）默认报错，可以改成 {}
try {
  z.toJSONSchema(z.object({ at: z.date() }));
} catch (error) {
  console.log((error as Error).message); // Date cannot be represented in JSON Schema
}
show(z.toJSONSchema(z.object({ at: z.date() }), { unrepresentable: "any" }).properties); // {"at":{}}

// ── 4. 复用与递归：$defs 和 $ref ─────────────────────────────────────
const City = z.string().meta({ id: "City", description: "城市名，例如「北京」" });
show(z.toJSONSchema(z.object({ from: City, to: City })));
// {…,"properties":{"from":{"$ref":"#/$defs/City"},"to":{"$ref":"#/$defs/City"}},…,"$defs":{"City":{"type":"string","description":"城市名，例如「北京」"}}}

interface FileNode {
  name: string;
  children: FileNode[];
}
const FileNode: z.ZodType<FileNode> = z.object({
  name: z.string(),
  get children() {
    return z.array(FileNode);
  },
});
show(z.toJSONSchema(FileNode).properties); // {"name":{"type":"string"},"children":{"type":"array","items":{"$ref":"#"}}}

// ── 5. 严格模式：可选字段改成「必填但可以为 null」 ───────────────────
// 严格模式要求每个属性都在 required 里，所以用 nullable 表达「可以不给」
const StrictSearchArgs = z.object({
  query: z.string(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .nullable()
    .describe("最多返回几条，null 表示用默认值 10")
    .transform((limit) => limit ?? 10),
});
const strictJson = z.toJSONSchema(StrictSearchArgs, { io: "input" });
show(strictJson.required); // ["query","limit"]
show(strictJson.properties?.["limit"]);
// {"anyOf":[{"type":"integer","minimum":1,"maximum":50},{"type":"null"}],"description":"最多返回几条，null 表示用默认值 10"}
console.log(StrictSearchArgs.parse({ query: "ts", limit: null })); // { query: 'ts', limit: 10 }

// io: "input" 时普通 z.object 不写 additionalProperties（多余的键会被剥掉，不算错）
// 严格模式需要它是 false，可以用 override 在生成时补上
const withOverride = z.toJSONSchema(StrictSearchArgs, {
  io: "input",
  override: (ctx) => {
    if (ctx.jsonSchema.type === "object" && ctx.jsonSchema.additionalProperties === undefined) {
      ctx.jsonSchema.additionalProperties = false;
    }
  },
});
show(withOverride.additionalProperties); // false
