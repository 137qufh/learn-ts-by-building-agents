/**
 * 练习 6-8：追踪与日志
 *
 * 课程：chapters/06-harness/08-tracing.md
 * 运行：pnpm ex 08-tracing
 *
 * agent 跑了 40 秒、调用了 12 次模型和 30 次工具，最后给了一个错误的答案。时间花在哪里？哪一步走错了？
 * 追踪（tracing）把一次运行记录成一棵 span 树：agent.run → step → model / tool。
 *
 * 第一部分：createRecordingTracer({ now, onEnd })
 *   在内存里记录所有 span 的 tracer（测试和本地调试用；生产环境可以换成 OpenTelemetry，接口是一样的思路）。
 *   start(name, { parent, attributes })：
 *   - 新建一条 SpanRecord：id 从 1 开始递增；start 是 now()（默认 performance.now()）；status 是 "running"；
 *     attributes 是传入的属性的 **副本**；有 parent 时记录 parentId（parent 的 id 是 0 时视为没有 parent）
 *   - 记录按开始的顺序放进 spans
 *   - 返回的 Span：set(key, value) 设置属性；end() 结束（status "ok"）；
 *     fail(error) 结束（status "error"，error 是错误的 message，不是 Error 时用 String）。
 *     结束时记录 end 并调用 onEnd(record)；只结束一次，之后的 end/fail 被忽略
 *   tree()：每个 span 一行 `${name} ${Math.round(时长)}ms`，没结束的是 `${name} （未结束）`；
 *     失败的后面加上 ` ✗ ${error}`。子 span 在父 span 下面，每深一层多缩进两个空格，同一层按开始的顺序
 *
 * 第二部分：traced(tracer, name, options, fn)
 *   开始一个 span，把它交给 fn；fn 成功时 end 并返回结果，失败时 fail 并把原来的错误抛出去。
 *
 * 第三部分：redact、isSecretKey、toJsonLine
 *   日志会被复制、上传、贴进 issue。API key 绝不能出现在里面。
 *   isSecretKey(key)：把键转成小写、去掉 - 和 _ 之后，以 apikey、token、secret、password、authorization、
 *     cookie 之一 **结尾**。（为什么不是"包含"？想想 inputTokens）
 *   redact(value, isSecret = isSecretKey)：深层复制，键满足 isSecret 的值换成 "[REDACTED]"。数组逐项处理，
 *     其他值原样返回。不修改原来的值
 *   toJsonLine(record)：redact 之后的 JSON，一行（JSON Lines 格式，一行一条记录，方便追加和 grep）
 */
import { todo } from "../todo.ts";

export type Attributes = Record<string, unknown>;

export interface SpanRecord {
  id: number;
  parentId?: number;
  name: string;
  start: number;
  end?: number;
  status: "running" | "ok" | "error";
  error?: string;
  attributes: Attributes;
}

export interface Span {
  readonly id: number;
  set(key: string, value: unknown): void;
  end(): void;
  fail(error: unknown): void;
}

export interface SpanOptions {
  parent?: Span;
  attributes?: Attributes;
}

export interface Tracer {
  start(name: string, options?: SpanOptions): Span;
}

const noopSpan: Span = { id: 0, set() {}, end() {}, fail() {} };

/** 什么都不记录的 tracer：harness 没有配置 tracer 时用它，代码里就不用到处判断"有没有 tracer" */
export const noopTracer: Tracer = { start: () => noopSpan };

export interface RecordingTracer extends Tracer {
  readonly spans: readonly SpanRecord[];
  tree(): string;
}

export interface RecordingTracerOptions {
  now?: () => number;
  onEnd?: (record: SpanRecord) => void;
}

export function createRecordingTracer(options: RecordingTracerOptions = {}): RecordingTracer {
  return todo("实现 createRecordingTracer");
}

export async function traced<T>(
  tracer: Tracer,
  name: string,
  options: SpanOptions,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return todo("实现 traced");
}

export function isSecretKey(key: string): boolean {
  return todo("实现 isSecretKey");
}

export function redact(value: unknown, isSecret: (key: string) => boolean = isSecretKey): unknown {
  return todo("实现 redact");
}

export function toJsonLine(record: SpanRecord): string {
  return todo("实现 toJsonLine");
}
