/**
 * 追踪与日志：span、树状输出、去掉敏感信息（来自练习 6-8）
 */

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
  const { now = () => performance.now(), onEnd } = options;
  const spans: SpanRecord[] = [];
  let nextId = 1;

  function start(name: string, spanOptions: SpanOptions = {}): Span {
    const record: SpanRecord = {
      id: nextId++,
      name,
      start: now(),
      status: "running",
      attributes: { ...spanOptions.attributes },
    };
    if (spanOptions.parent !== undefined && spanOptions.parent.id !== 0) {
      record.parentId = spanOptions.parent.id;
    }
    spans.push(record);

    const close = (status: "ok" | "error", error?: string): void => {
      if (record.status !== "running") {
        return; // 只结束一次：第二次 end/fail 什么都不做
      }
      record.status = status;
      record.end = now();
      if (error !== undefined) {
        record.error = error;
      }
      onEnd?.(record);
    };
    return {
      id: record.id,
      set(key, value) {
        record.attributes[key] = value;
      },
      end: () => close("ok"),
      fail: (error) => close("error", error instanceof Error ? error.message : String(error)),
    };
  }

  function tree(): string {
    const lines: string[] = [];
    const visit = (parentId: number | undefined, depth: number): void => {
      for (const span of spans) {
        if (span.parentId !== parentId) {
          continue;
        }
        const duration =
          span.end === undefined ? "（未结束）" : `${Math.round(span.end - span.start)}ms`;
        const error = span.error === undefined ? "" : ` ✗ ${span.error}`;
        lines.push(`${"  ".repeat(depth)}${span.name} ${duration}${error}`);
        visit(span.id, depth + 1);
      }
    };
    visit(undefined, 0);
    return lines.join("\n");
  }

  return { start, spans, tree };
}

export async function traced<T>(
  tracer: Tracer,
  name: string,
  options: SpanOptions,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const span = tracer.start(name, options);
  try {
    const value = await fn(span);
    span.end();
    return value;
  } catch (error) {
    span.fail(error);
    throw error;
  }
}

const SECRET_SUFFIXES = ["apikey", "token", "secret", "password", "authorization", "cookie"];

export function isSecretKey(key: string): boolean {
  // 先统一大小写、去掉 - 和 _：apiKey、api_key、API-KEY 都变成 apikey。
  // 用"结尾是"而不是"包含"：accessToken 是密钥，inputTokens、maxTokens 只是数字
  const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");
  return SECRET_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function redact(value: unknown, isSecret: (key: string) => boolean = isSecretKey): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, isSecret));
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        isSecret(key) ? "[REDACTED]" : redact(item, isSecret),
      ]),
    );
  }
  return value;
}

export function toJsonLine(record: SpanRecord): string {
  return JSON.stringify(redact(record));
}
