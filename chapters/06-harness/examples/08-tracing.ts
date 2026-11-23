// 6.8 追踪与日志
// 运行：pnpm tsx chapters/06-harness/examples/08-tracing.ts

type SpanRecord = {
  id: number;
  parentId?: number;
  name: string;
  start: number;
  end?: number;
  attributes: Record<string, unknown>;
};

// ── 1. 一个最小的 tracer，时钟可以注入 ──────────────────────────────
let clock = 0;
const spans: SpanRecord[] = [];
function start(
  name: string,
  parent?: SpanRecord,
  attributes: Record<string, unknown> = {},
): SpanRecord {
  const record: SpanRecord = {
    id: spans.length + 1,
    name,
    start: clock,
    attributes: { ...attributes },
  };
  if (parent !== undefined) record.parentId = parent.id;
  spans.push(record);
  return record;
}
const end = (span: SpanRecord): void => {
  span.end = clock;
};

// ── 2. 模拟一次运行：时间花在哪里？ ─────────────────────────────────
const run = start("agent.run");
const step1 = start("step", run, { step: 1 });
const model1 = start("model", step1);
clock += 2870;
end(model1);
const list = start("tool list_files", step1);
const search = start("tool search", step1); // 和 list_files 并行
clock += 12;
end(list);
clock += 218;
end(search);
end(step1);
const step2 = start("step", run, { step: 2 });
const model2 = start("model", step2);
clock += 1950;
end(model2);
const tests = start("tool run_tests", step2);
clock += 16420;
end(tests);
end(step2);
end(run);

function tree(parentId: number | undefined = undefined, depth = 0): string[] {
  return spans
    .filter((span) => span.parentId === parentId)
    .flatMap((span) => [
      `${"  ".repeat(depth)}${span.name} ${(span.end ?? clock) - span.start}ms`,
      ...tree(span.id, depth + 1),
    ]);
}
console.log(tree().join("\n"));
// agent.run 21470ms
//   step 3100ms
//     model 2870ms
//     tool list_files 12ms
//     tool search 230ms
//   step 18370ms
//     model 1950ms
//     tool run_tests 16420ms   ← 慢的不是模型，是测试

// ── 3. JSON Lines：一行一条，可以追加，可以 grep ─────────────────────
console.log();
for (const span of spans.slice(0, 2)) console.log(JSON.stringify(span));
// {"id":1,"name":"agent.run","start":0,"attributes":{},"end":21470}
// {"id":2,"name":"step","start":0,"attributes":{"step":1},"parentId":1,"end":3100}

// ── 4. 脱敏：规则太宽会误伤，太窄会漏掉 ──────────────────────────────
const attributes = {
  apiKey: "sk-123",
  accessToken: "t-456",
  inputTokens: 1200,
  maxTokens: 4096,
  model: "m",
};

const naive = (key: string): boolean => /token|secret|password|key/i.test(key);
const better = (key: string): boolean => {
  const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");
  return ["apikey", "token", "secret", "password", "authorization", "cookie"].some((suffix) =>
    normalized.endsWith(suffix),
  );
};
const redact = (value: Record<string, unknown>, isSecret: (key: string) => boolean) =>
  Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, isSecret(key) ? "[REDACTED]" : item]),
  );

console.log(`\n包含 token：${JSON.stringify(redact(attributes, naive))}`);
// 包含 token：{"apiKey":"[REDACTED]","accessToken":"[REDACTED]","inputTokens":"[REDACTED]","maxTokens":"[REDACTED]","model":"m"}
//                                                          ↑ 用量也被抹掉了
console.log(`以 token 结尾：${JSON.stringify(redact(attributes, better))}`);
// 以 token 结尾：{"apiKey":"[REDACTED]","accessToken":"[REDACTED]","inputTokens":1200,"maxTokens":4096,"model":"m"}
