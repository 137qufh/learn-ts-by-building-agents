import { describe, expect, test, vi } from "vitest";
import { createChannel, dispatchEvent, type AgentEvent } from "./06-event-stream.ts";

async function drain<T>(source: AsyncIterable<T>): Promise<T[]> {
  const list: T[] = [];
  for await (const value of source) list.push(value);
  return list;
}

describe("createChannel", () => {
  test("先 push 再遍历：按顺序拿到所有值，close 之后结束", async () => {
    const channel = createChannel<number>();
    expect(channel.push(1)).toBe(true);
    channel.push(2);
    channel.close();
    expect(await drain(channel)).toEqual([1, 2]);
  });

  test("消费者在等待时，push 会唤醒它", async () => {
    const channel = createChannel<string>();
    const iterator = channel[Symbol.asyncIterator]();
    const first = iterator.next(); // 缓冲区是空的：消费者在等
    await new Promise((resolve) => setTimeout(resolve, 5));
    channel.push("a");
    expect(await first).toEqual({ value: "a", done: false }); // 不需要 close 就能拿到

    const second = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 5));
    channel.push("b");
    expect(await second).toEqual({ value: "b", done: false });
    channel.close();
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  });

  test("close 之后 push 被忽略并返回 false；closed 反映状态", () => {
    const channel = createChannel<number>();
    expect(channel.closed).toBe(false);
    channel.close();
    expect(channel.closed).toBe(true);
    expect(channel.push(1)).toBe(false);
  });

  test("fail：已经缓冲的值先交出去，然后抛出错误", async () => {
    const channel = createChannel<number>();
    const boom = new Error("boom");
    channel.push(1);
    channel.fail(boom);
    const seen: number[] = [];
    await expect(async () => {
      for await (const value of channel) seen.push(value);
    }).rejects.toBe(boom);
    expect(seen).toEqual([1]);
    expect(channel.closed).toBe(true);
  });

  test("close 之后再 fail 没有效果", async () => {
    const channel = createChannel<number>();
    channel.push(1);
    channel.close();
    channel.fail(new Error("太晚了"));
    expect(await drain(channel)).toEqual([1]);
  });

  test("只能遍历一次", () => {
    const channel = createChannel<number>();
    channel[Symbol.asyncIterator]();
    expect(() => channel[Symbol.asyncIterator]()).toThrow("通道只能被遍历一次");
  });

  test("消费者 break 之后：之后的 push 返回 false，缓冲被清空", async () => {
    const channel = createChannel<number>();
    channel.push(1);
    channel.push(2);
    channel.push(3);
    for await (const value of channel) {
      if (value === 1) break;
    }
    expect(channel.push(4)).toBe(false);
  });

  test("没有人遍历时，值一直缓冲着", async () => {
    const channel = createChannel<number>();
    for (let i = 0; i < 1000; i++) channel.push(i);
    channel.close();
    expect(await drain(channel)).toHaveLength(1000);
  });
});

describe("dispatchEvent", () => {
  test("把事件交给对应类型的处理函数；没有处理函数的事件被忽略", () => {
    const onText = vi.fn();
    const onStart = vi.fn();
    // 用宽松的类型调用，题目里 EventOf、EventHandlers 还没写好时也能通过类型检查；精确的类型由 .test-d.ts 检查
    const dispatch = dispatchEvent as unknown as (
      event: AgentEvent,
      handlers: Record<string, unknown>,
    ) => void;
    const text: AgentEvent = { type: "text", step: 1, text: "hi" };
    dispatch(text, { text: onText, step_start: onStart });
    dispatch({ type: "step_start", step: 2 }, { text: onText, step_start: onStart });
    dispatch({ type: "model_end", step: 2, finishReason: "stop" }, { text: onText });
    expect(onText).toHaveBeenCalledExactlyOnceWith(text);
    expect(onStart).toHaveBeenCalledExactlyOnceWith({ type: "step_start", step: 2 });
  });
});
