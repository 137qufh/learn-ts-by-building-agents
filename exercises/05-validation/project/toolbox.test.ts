import { describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { defineFunction, strictFunction } from "../04-tool-schema.ts";
import { createToolbox, defineTool, toContent, type CallOptions } from "./toolbox.ts";

// call 的参数类型在 toolbox.test-d.ts 里检查；这里只测运行时行为，所以用一个宽松的签名调用它，
// 这样在你实现第二部分的类型之前，这个文件也能通过类型检查
type LooseCall = (name: string, args: unknown, options?: CallOptions) => Promise<unknown>;
function callOf(tools: { call: unknown }): LooseCall {
  return (tools.call as LooseCall).bind(tools);
}

// 工具在函数里定义：没实现 defineTool 时，只有用到它的测试失败
function makeTools() {
  const readFile = defineTool({
    name: "read_file",
    description: "读取一个文本文件",
    parameters: z.object({
      path: z.string().min(1, "path 不能为空"),
      maxLines: z.number().int().min(1).default(200),
    }),
    execute: ({ path, maxLines }) => `${path} 的前 ${maxLines} 行`,
  });

  const search = defineTool({
    name: "search",
    description: "搜索代码",
    strict: true,
    parameters: z.object({
      query: z.string(),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .nullable()
        .transform((limit) => limit ?? 10),
    }),
    execute: async ({ query, limit }) => {
      await Promise.resolve();
      return { query, limit, hits: [`src/${query}.ts`] };
    },
  });

  return { readFile, search };
}

describe("第一部分：defineTool", () => {
  test("原样返回工具定义", () => {
    const definition = {
      name: "noop",
      description: "",
      parameters: z.object({}),
      execute: () => undefined,
    };
    expect(defineTool(definition)).toBe(definition);
  });
});

describe("第三部分：toContent", () => {
  test("字符串原样返回，undefined 有固定的说明，其他用 JSON", () => {
    expect(toContent("你好")).toBe("你好");
    expect(toContent("")).toBe("");
    expect(toContent(undefined)).toBe("（没有返回值）");
    expect(toContent(null)).toBe("null");
    expect(toContent(42)).toBe("42");
    expect(toContent({ a: [1, "x"] })).toBe('{"a":[1,"x"]}');
  });

  test("转不成 JSON 时抛出", () => {
    expect(() => toContent(1n)).toThrow(TypeError); // JSON.stringify 不认识 BigInt
  });
});

describe("第四部分：createToolbox", () => {
  test("names：按传入的顺序", () => {
    const { readFile, search } = makeTools();
    expect(createToolbox([search, readFile]).names()).toEqual(["search", "read_file"]);
  });

  test("工具名重复时报错", () => {
    const { readFile } = makeTools();
    expect(() => createToolbox([readFile, readFile])).toThrow('工具 "read_file" 重复了');
  });

  test("schemas：strict 的工具用 strictFunction，其他用 defineFunction", () => {
    const { readFile, search } = makeTools();
    expect(createToolbox([readFile, search]).schemas()).toEqual([
      defineFunction("read_file", "读取一个文本文件", readFile.parameters),
      strictFunction("search", "搜索代码", search.parameters),
    ]);
  });

  test("schemas：创建时就检查，strict 工具的 schema 不合格时立刻报错", () => {
    const bad = defineTool({
      name: "bad",
      description: "",
      strict: true,
      parameters: z.object({ a: z.string().optional() }),
      execute: () => "",
    });
    expect(() => createToolbox([bad])).toThrow("bad 不符合严格模式");
  });

  test("schemas：每次返回副本", () => {
    const { readFile } = makeTools();
    const tools = createToolbox([readFile]);
    const first = tools.schemas();
    first[0]!.name = "changed";
    (first[0]!.parameters as { type?: string }).type = "changed";
    expect(tools.schemas()[0]?.name).toBe("read_file");
    expect(tools.schemas()[0]?.parameters.type).toBe("object");
  });

  test("没有工具也可以", () => {
    const tools = createToolbox([]);
    expect(tools.names()).toEqual([]);
    expect(tools.schemas()).toEqual([]);
  });
});

describe("第四部分：call", () => {
  test("解析参数（默认值、转换）后执行，结果是返回值", async () => {
    const { readFile, search } = makeTools();
    const tools = createToolbox([readFile, search]);
    expect(await callOf(tools)("read_file", { path: "a.ts" })).toBe("a.ts 的前 200 行");
    expect(await callOf(tools)("search", { query: "agent", limit: null })).toEqual({
      query: "agent",
      limit: 10,
      hits: ["src/agent.ts"],
    });
  });

  test("参数不合格：Promise 拒绝，错误是 ZodError", async () => {
    const { readFile } = makeTools();
    const tools = createToolbox([readFile]);
    await expect(callOf(tools)("read_file", { path: "" })).rejects.toBeInstanceOf(z.ZodError);
  });

  test("未知工具：Promise 拒绝（不是同步抛出）", async () => {
    const { readFile } = makeTools();
    const tools = createToolbox([readFile]);
    const promise = callOf(tools)("nope", {});
    await expect(promise).rejects.toThrow('未知工具 "nope"');
  });

  test("把 signal 作为 context 传给工具；没有 signal 时 context 是 {}", async () => {
    const execute = vi.fn((_args: { x: number }, _context: { signal?: AbortSignal }) => "ok");
    const probe = defineTool({
      name: "probe",
      description: "",
      parameters: z.object({ x: z.number() }),
      execute,
    });
    const tools = createToolbox([probe]);
    const controller = new AbortController();
    await callOf(tools)("probe", { x: 1 }, { signal: controller.signal });
    await callOf(tools)("probe", { x: 2 });
    expect(execute.mock.calls[0]?.[1]).toEqual({ signal: controller.signal });
    expect(execute.mock.calls[1]?.[1]).toEqual({});
    expect(execute.mock.calls[1]?.[1]).not.toHaveProperty("signal");
  });
});

describe("第四部分：dispatch", () => {
  test("成功：ok 为 true，content 是 toContent(返回值)", async () => {
    const { readFile, search } = makeTools();
    const tools = createToolbox([readFile, search]);
    expect(
      await tools.dispatch({
        id: "c1",
        name: "read_file",
        arguments: '{"path":"a.ts","maxLines":5}',
      }),
    ).toEqual({
      id: "c1",
      ok: true,
      content: "a.ts 的前 5 行",
    });
    expect(
      await tools.dispatch({ id: "c2", name: "search", arguments: '{"query":"x","limit":null}' }),
    ).toEqual({
      id: "c2",
      ok: true,
      content: '{"query":"x","limit":10,"hits":["src/x.ts"]}',
    });
  });

  test("未知工具：列出可用的工具", async () => {
    const { readFile, search } = makeTools();
    const tools = createToolbox([readFile, search]);
    expect(await tools.dispatch({ id: "c1", name: "write_file", arguments: "{}" })).toEqual({
      id: "c1",
      ok: false,
      content: '未知工具 "write_file"。可用的工具：read_file, search',
    });
  });

  test("参数不是 JSON、不合格：content 是 parseToolArguments 的错误，工具不会执行", async () => {
    const execute = vi.fn(() => "不该执行");
    const tool = defineTool({
      name: "t",
      description: "",
      parameters: z.object({ path: z.string().min(1, "path 不能为空") }),
      execute,
    });
    const tools = createToolbox([tool]);
    const notJson = await tools.dispatch({ id: "c1", name: "t", arguments: '{"path":' });
    expect(notJson.ok).toBe(false);
    expect(notJson.content).toMatch(/^参数不是合法的 JSON：/);
    expect(await tools.dispatch({ id: "c2", name: "t", arguments: '{"path":""}' })).toEqual({
      id: "c2",
      ok: false,
      content: "参数不符合要求：\n- path: path 不能为空",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  test("工具抛出错误：变成给模型看的结果，不抛出", async () => {
    const failing = defineTool({
      name: "failing",
      description: "",
      parameters: z.object({}),
      execute: async () => {
        throw new Error("磁盘满了");
      },
    });
    const throwsString = defineTool({
      name: "throws_string",
      description: "",
      parameters: z.object({}),
      execute: () => {
        throw "坏了";
      },
    });
    const tools = createToolbox([failing, throwsString]);
    expect(await tools.dispatch({ id: "c1", name: "failing", arguments: "{}" })).toEqual({
      id: "c1",
      ok: false,
      content: "工具执行失败：磁盘满了",
    });
    expect(await tools.dispatch({ id: "c2", name: "throws_string", arguments: "{}" })).toEqual({
      id: "c2",
      ok: false,
      content: "工具执行失败：坏了",
    });
  });

  test("返回值转不成文本", async () => {
    const big = defineTool({
      name: "big",
      description: "",
      parameters: z.object({}),
      execute: () => 1n,
    });
    const result = await createToolbox([big]).dispatch({ id: "c1", name: "big", arguments: "{}" });
    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/^工具的返回值无法转成文本：\S/);
  });

  test("已经取消：不执行工具，抛出 signal.reason", async () => {
    const execute = vi.fn(() => "不该执行");
    const tool = defineTool({ name: "t", description: "", parameters: z.object({}), execute });
    const controller = new AbortController();
    const reason = new Error("用户取消了");
    controller.abort(reason);
    await expect(
      createToolbox([tool]).dispatch(
        { id: "c1", name: "t", arguments: "{}" },
        { signal: controller.signal },
      ),
    ).rejects.toBe(reason);
    expect(execute).not.toHaveBeenCalled();
  });

  test("执行中被取消：工具因此抛出的错误原样传出去，而不是告诉模型", async () => {
    const controller = new AbortController();
    const slow = defineTool({
      name: "slow",
      description: "",
      parameters: z.object({}),
      execute: (_args, { signal }) =>
        new Promise<string>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    });
    const promise = createToolbox([slow]).dispatch(
      { id: "c1", name: "slow", arguments: "{}" },
      { signal: controller.signal },
    );
    controller.abort();
    await expect(promise).rejects.toHaveProperty("name", "AbortError");
  });

  test("把 signal 作为 context 传给工具", async () => {
    const execute = vi.fn((_args: object, _context: { signal?: AbortSignal }) => "ok");
    const probe = defineTool({ name: "probe", description: "", parameters: z.object({}), execute });
    const tools = createToolbox([probe]);
    const controller = new AbortController();
    await tools.dispatch(
      { id: "c1", name: "probe", arguments: "{}" },
      { signal: controller.signal },
    );
    await tools.dispatch({ id: "c2", name: "probe", arguments: "{}" });
    expect(execute.mock.calls[0]?.[1]).toEqual({ signal: controller.signal });
    expect(execute.mock.calls[1]?.[1]).toEqual({});
  });
});
