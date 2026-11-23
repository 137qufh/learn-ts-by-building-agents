// 6.6 事件流：给界面的流式事件
// 运行：pnpm tsx chapters/06-harness/examples/06-event-stream.ts

type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string }
  | { type: "tool_result"; name: string; ok: boolean }
  | { type: "done"; steps: number };

// ── 1. 通道：生产者"推"，消费者"拉" ────────────────────────────────
function createChannel<T>() {
  const buffer: T[] = [];
  let closed = false;
  let wake: (() => void) | undefined;
  const notify = (): void => {
    wake?.();
    wake = undefined;
  };
  return {
    push(value: T): void {
      buffer.push(value);
      notify();
    },
    close(): void {
      closed = true;
      notify();
    },
    async *[Symbol.asyncIterator](): AsyncGenerator<T> {
      while (true) {
        if (buffer.length > 0) {
          yield buffer.shift()!;
          continue;
        }
        if (closed) return;
        await new Promise<void>((resolve) => {
          wake = resolve; // 等 push 或 close 叫醒我
        });
      }
    },
  };
}

// ── 2. 生产者：一个假的 agent，按自己的节奏发出事件 ─────────────────────
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const channel = createChannel<AgentEvent>();

async function fakeAgent(): Promise<void> {
  for (const text of ["我先", "看一下", "目录。"]) {
    channel.push({ type: "text", text });
    await sleep(20);
  }
  channel.push({ type: "tool_call", name: "list_files" });
  channel.push({ type: "tool_call", name: "search" }); // 一下子推两个：消费者稍后会从缓冲区里取到
  await sleep(30);
  channel.push({ type: "tool_result", name: "search", ok: true });
  channel.push({ type: "tool_result", name: "list_files", ok: true });
  channel.push({ type: "done", steps: 1 });
  channel.close();
}
const running = fakeAgent(); // 立刻开始，不等有人消费

// ── 3. 精确类型的事件处理函数 ─────────────────────────────────────────
type EventOf<K extends AgentEvent["type"]> = Extract<AgentEvent, { type: K }>;
type EventHandlers = { [K in AgentEvent["type"]]?: (event: EventOf<K>) => void };

function dispatchEvent<K extends AgentEvent["type"]>(
  event: EventOf<K>,
  handlers: EventHandlers,
): void {
  handlers[event.type]?.(event); // 以 K 为类型参数：handlers[event.type] 和 event 是配对的（2.8 节）
}

// 如果参数写成 AgentEvent，就会遇到关联的联合：
function dispatchWrong(event: AgentEvent, handlers: EventHandlers): void {
  // @ts-expect-error 参数类型是 never：TypeScript 不知道 event.type 和 event 是配对的
  handlers[event.type]?.(event);
}
void dispatchWrong;

// ── 4. 消费者：渲染到终端 ────────────────────────────────────────────
let midLine = false; // 模型的文字没有换行，在它后面打印别的内容之前先换行
const print = (line: string): void => {
  console.log(midLine ? `\n${line}` : line);
  midLine = false;
};
const handlers: EventHandlers = {
  text: (e) => {
    process.stdout.write(e.text); // e 的类型就是 text 事件，不用再收窄
    midLine = true;
  },
  tool_call: (e) => print(`  → ${e.name}`),
  tool_result: (e) => print(`  ${e.ok ? "✓" : "✗"} ${e.name}`),
  done: (e) => print(`完成，${e.steps} 步`),
};
for await (const event of channel) {
  dispatchEvent(event, handlers);
}
await running;
// 我先看一下目录。
//   → list_files
//   → search
//   ✓ search
//   ✓ list_files
// 完成，1 步
