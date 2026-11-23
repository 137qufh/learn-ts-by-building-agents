// 7.9 评判要能解析失败；回归看的是下降，不是绝对分
// 运行：node chapters/07-extensions/examples/09-judge.ts
//
// 预期输出：
// mean 1.5
// rejected 评分项 "准确" 的分数必须是 0、1 或 2
// regression 检索 -1

function parseScore(text: string): { ok: true; mean: number } | { ok: false; error: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, error: "无法解析评测结果：找不到 JSON 对象" };
  const value: unknown = JSON.parse(text.slice(start, end + 1));
  if (typeof value !== "object" || value === null || !("scores" in value)) {
    return { ok: false, error: "评测结果缺少 scores" };
  }
  const scores = value.scores;
  if (!Array.isArray(scores)) return { ok: false, error: "评测结果缺少 scores" };
  let sum = 0;
  for (const row of scores) {
    if (typeof row !== "object" || row === null || !("score" in row)) continue;
    if (typeof row.score !== "number") {
      const name = "criterion" in row && typeof row.criterion === "string" ? row.criterion : "?";
      return { ok: false, error: `评分项 "${name}" 的分数必须是 0、1 或 2` };
    }
    sum += row.score;
  }
  return { ok: true, mean: sum / scores.length };
}

const good = parseScore(
  '```json\n{"scores":[{"criterion":"准确","score":2},{"criterion":"完整","score":1}]}\n```',
);
console.log("mean", good.ok ? good.mean : good.error);
const bad = parseScore('{"scores":[{"criterion":"准确","score":"2"}]}');
console.log("rejected", bad.ok ? bad.mean : bad.error);

const current = { 总结: 2, 检索: 1 };
const baseline = { 总结: 2, 检索: 2 };
for (const [name, before] of Object.entries(baseline)) {
  const after = current[name as keyof typeof current];
  if (before - after > 0) console.log("regression", name, after - before);
}
