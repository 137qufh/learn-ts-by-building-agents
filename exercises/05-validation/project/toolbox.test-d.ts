import { describe, expectTypeOf, test } from "vitest";
import { z } from "zod";
import {
  createToolbox,
  defineTool,
  type ArgsInput,
  type ResultOf,
  type ToolContext,
  type ZodTool,
} from "./toolbox.ts";

const ReadFileArgs = z.object({
  path: z.string(),
  maxLines: z.number().int().default(200),
});

const readFile = defineTool({
  name: "read_file",
  description: "",
  parameters: ReadFileArgs,
  execute: (args, context) => {
    expectTypeOf(args).toEqualTypeOf<{ path: string; maxLines: number }>();
    expectTypeOf(context).toEqualTypeOf<ToolContext>();
    return args.path.length;
  },
});

const search = defineTool({
  name: "search",
  description: "",
  parameters: z.object({
    query: z.string(),
    tags: z.string().transform((text) => text.split(",")),
  }),
  execute: async ({ tags }) => ({ tags }),
});

describe("第一部分：defineTool", () => {
  test("保留工具名的字面量和 schema 的类型", () => {
    expectTypeOf(readFile).toEqualTypeOf<ZodTool<"read_file", typeof ReadFileArgs, number>>();
    expectTypeOf(readFile.name).toEqualTypeOf<"read_file">();
  });
});

describe("第二部分：类型工具", () => {
  test("ArgsInput 是 schema 的输入类型", () => {
    expectTypeOf<ArgsInput<typeof readFile>>().toEqualTypeOf<{
      path: string;
      maxLines?: number | undefined;
    }>();
    expectTypeOf<ArgsInput<typeof search>>().toEqualTypeOf<{ query: string; tags: string }>();
  });

  test("ResultOf 拆开 Promise", () => {
    expectTypeOf<ResultOf<typeof readFile>>().toEqualTypeOf<number>();
    expectTypeOf<ResultOf<typeof search>>().toEqualTypeOf<{ tags: string[] }>();
  });
});

describe("第四部分：工具箱的类型", () => {
  const tools = createToolbox([readFile, search]);

  test("names 是工具名的联合", () => {
    expectTypeOf(tools.names()).toEqualTypeOf<("read_file" | "search")[]>();
  });

  test("call：名字、参数、返回值都有类型", () => {
    expectTypeOf(tools.call("read_file", { path: "a" })).toEqualTypeOf<Promise<number>>();
    expectTypeOf(tools.call("search", { query: "q", tags: "a,b" })).toEqualTypeOf<
      Promise<{ tags: string[] }>
    >();

    // @ts-expect-error 没有这个工具
    void tools.call("write_file", {});
    // @ts-expect-error 缺少 path
    void tools.call("read_file", {});
    // @ts-expect-error 参数是输入类型：tags 传字符串，而不是数组
    void tools.call("search", { query: "q", tags: ["a"] });
  });
});
