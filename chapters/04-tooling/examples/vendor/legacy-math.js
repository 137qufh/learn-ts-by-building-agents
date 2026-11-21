// 一个"老式"的纯 JavaScript 库：没有类型，作者也不打算写。
// 4.4 节的示例用旁边的 legacy-math.d.ts 给它补上类型。

export const PRECISION = 2;

export function round(value, digits = PRECISION) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function stats(values) {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return { min: Math.min(...values), max: Math.max(...values), mean: sum / values.length };
}

export default { round, stats };
