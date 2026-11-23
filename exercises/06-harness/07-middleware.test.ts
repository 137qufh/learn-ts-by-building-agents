import type { ChatRequest, RawToolCall } from "@learn-ts/agent-kit";
import { describe, expect, test, vi } from "vitest";
import {
  compose,
  requireApproval,
  runAfterStep,
  runBeforeModel,
  toolPipeline,
  type AgentMiddleware,
  type ToolInvocation,
  type ToolOutcome,
  type Wrapper,
} from "./07-middleware.ts";

describe("compose", () => {
  test("洋葱模型：第一个包装在最外层，进去和出来的顺序相反", async () => {
    const log: string[] = [];
    const wrap =
      (name: string): Wrapper<number, number> =>
      async (input, next) => {
        log.push(`→ ${name}`);
        const result = await next(input + 1);
        log.push(`← ${name}`);
        return result * 10;
      };
    const run = compose([wrap("a"), wrap("b")], async (input) => {
      log.push(`handler ${input}`);
      return input;
    });
    expect(await run(0)).toBe(200);
    expect(log).toEqual(["→ a", "→ b", "handler 2", "← b", "← a"]);
  });

  test("没有包装时直接调用 handler", async () => {
    expect(await compose<number, number>([], async (x) => x * 2)(21)).toBe(42);
  });

  test("包装可以不调用 next：短路，后面的包装和 handler 都不执行", async () => {
    const handler = vi.fn(async (x: number) => x);
    const later = vi.fn<Wrapper<number, number>>((x, next) => next(x));
    const run = compose<number, number>([async () => -1, later], handler);
    expect(await run(5)).toBe(-1);
    expect(later).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  test("错误一层层传出来，包装可以捕获并改写", async () => {
    const run = compose<number, string>(
      [
        async (x, next) => {
          try {
            return await next(x);
          } catch (error) {
            return `兜住了：${(error as Error).message}`;
          }
        },
      ],
      async () => {
        throw new Error("坏了");
      },
    );
    expect(await run(1)).toBe("兜住了：坏了");
  });

  test("同步抛出的错误也变成拒绝", async () => {
    const run = compose<number, number>(
      [
        () => {
          throw new Error("同步");
        },
      ],
      async (x) => x,
    );
    await expect(run(1)).rejects.toThrow("同步");
  });

  test("一个包装调用 next 两次：拒绝", async () => {
    const run = compose<number, number>(
      [
        async (x, next) => {
          await next(x);
          return next(x);
        },
      ],
      async (x) => x,
    );
    await expect(run(1)).rejects.toThrow("next() 被调用了多次");
  });

  test("组合出来的函数可以反复调用", async () => {
    const run = compose<number, number>([async (x, next) => next(x)], async (x) => x);
    expect(await run(1)).toBe(1);
    expect(await run(2)).toBe(2);
  });
});

const request: ChatRequest = { messages: [{ role: "user", content: "hi" }] };
const info = { step: 1, messages: request.messages };

describe("runBeforeModel", () => {
  test("按顺序传递：每个中间件拿到上一个的结果；返回 undefined 表示不修改", async () => {
    const middleware: AgentMiddleware[] = [
      { name: "temp", beforeModel: (req) => ({ ...req, temperature: 0 }) },
      { name: "noop", beforeModel: () => undefined },
      { name: "none" },
      {
        name: "async",
        beforeModel: async (req) => ({ ...req, maxTokens: req.temperature === 0 ? 100 : 1 }),
      },
    ];
    expect(await runBeforeModel(middleware, request, info)).toEqual({
      ...request,
      temperature: 0,
      maxTokens: 100,
    });
  });

  test("中间件拿到这一步的信息", async () => {
    const beforeModel = vi.fn(() => undefined);
    await runBeforeModel([{ name: "spy", beforeModel }], request, info);
    expect(beforeModel).toHaveBeenCalledWith(request, info);
  });
});

describe("runAfterStep", () => {
  test("第一个要求停下的中间件说了算，后面的不再调用", async () => {
    const later = vi.fn(() => undefined);
    const middleware: AgentMiddleware[] = [
      { name: "a", afterStep: () => undefined },
      { name: "budget", afterStep: async () => ({ stop: "超出预算" }) },
      { name: "later", afterStep: later },
    ];
    expect(await runAfterStep(middleware, info)).toEqual({
      middleware: "budget",
      reason: "超出预算",
    });
    expect(later).not.toHaveBeenCalled();
  });

  test("没有人要求停下：undefined", async () => {
    expect(await runAfterStep([{ name: "a" }], info)).toBeUndefined();
  });
});

const call: RawToolCall = { id: "c1", name: "write_file", arguments: "{}" };
const invocation = (
  c: RawToolCall = call,
  signal: AbortSignal = new AbortController().signal,
): ToolInvocation => ({ call: c, step: 1, signal });
const execute = async ({ call: c }: ToolInvocation): Promise<ToolOutcome> => ({
  ok: true,
  content: `ran ${c.name}`,
});

describe("toolPipeline", () => {
  test("把所有 wrapToolCall 按顺序组合起来，没有 wrapToolCall 的中间件跳过", async () => {
    const log: string[] = [];
    const middleware: AgentMiddleware[] = [
      { name: "a", wrapToolCall: (inv, next) => (log.push("a"), next(inv)) },
      { name: "b" },
      {
        name: "c",
        wrapToolCall: async (inv, next) => {
          log.push("c");
          const outcome = await next(inv);
          return { ...outcome, content: outcome.content.toUpperCase() };
        },
      },
    ];
    expect(await toolPipeline(middleware, execute)(invocation())).toEqual({
      ok: true,
      content: "RAN WRITE_FILE",
    });
    expect(log).toEqual(["a", "c"]);
  });
});

describe("requireApproval", () => {
  test("不在名单里的工具直接执行，不询问", async () => {
    const ask = vi.fn(() => false);
    const run = toolPipeline([requireApproval(["write_file"], ask)], execute);
    expect(await run(invocation({ ...call, name: "read_file" }))).toEqual({
      ok: true,
      content: "ran read_file",
    });
    expect(ask).not.toHaveBeenCalled();
  });

  test("同意了就执行；拒绝了就把拒绝告诉模型", async () => {
    const approve = toolPipeline([requireApproval(["write_file"], async () => true)], execute);
    expect(await approve(invocation())).toEqual({ ok: true, content: "ran write_file" });

    const ask = vi.fn(() => false);
    const deny = toolPipeline([requireApproval(["write_file"], ask)], execute);
    expect(await deny(invocation())).toEqual({
      ok: false,
      content: "用户拒绝了这次 write_file 调用。不要重试同样的操作，换一种做法或者直接回答。",
    });
    expect(ask).toHaveBeenCalledWith(call, expect.any(AbortSignal));
  });

  test("一次只问一个问题：并行的调用排队", async () => {
    const asked: string[] = [];
    const answers: ((value: boolean) => void)[] = [];
    const ask = (c: RawToolCall): Promise<boolean> => {
      asked.push(c.id);
      return new Promise<boolean>((resolve) => answers.push(resolve));
    };
    const run = toolPipeline([requireApproval(["write_file"], ask)], execute);
    const first = run(invocation({ ...call, id: "a" }));
    const second = run(invocation({ ...call, id: "b" }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(asked).toEqual(["a"]); // 第一个还没回答，第二个在排队

    answers[0]!(false);
    expect(await first).toMatchObject({ ok: false });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(asked).toEqual(["a", "b"]);
    answers[1]!(true);
    expect(await second).toEqual({ ok: true, content: "ran write_file" });
  });

  test("前一个提问失败了，后面的照样会问", async () => {
    let count = 0;
    const ask = (): boolean => {
      count++;
      if (count === 1) throw new Error("界面崩了");
      return true;
    };
    const run = toolPipeline([requireApproval(["write_file"], ask)], execute);
    await expect(run(invocation())).rejects.toThrow("界面崩了");
    expect(await run(invocation())).toEqual({ ok: true, content: "ran write_file" });
  });

  test("等回答的时候超时或者取消了：不执行工具", async () => {
    const controller = new AbortController();
    const spy = vi.fn(execute);
    const run = toolPipeline(
      [
        requireApproval(["write_file"], () => {
          controller.abort(new Error("超时了"));
          return true; // 用户在超时之后才点了同意
        }),
      ],
      spy,
    );
    await expect(run(invocation(call, controller.signal))).rejects.toThrow("超时了");
    expect(spy).not.toHaveBeenCalled();
  });

  test("排队期间已经取消的调用不再提问", async () => {
    const controller = new AbortController();
    controller.abort(new Error("取消了"));
    const ask = vi.fn(() => true);
    const run = toolPipeline([requireApproval(["write_file"], ask)], execute);
    await expect(run(invocation(call, controller.signal))).rejects.toThrow("取消了");
    expect(ask).not.toHaveBeenCalled();
  });

  test("名字是 require-approval", () => {
    expect(requireApproval([], () => true).name).toBe("require-approval");
  });
});
