import { describe, expect, test } from "vitest";
import {
  predictions,
  puzzle1,
  puzzle2,
  puzzle3,
  puzzle4,
  puzzle5,
  type Log,
} from "./01-event-order.ts";

const puzzles = { puzzle1, puzzle2, puzzle3, puzzle4, puzzle5 };

async function run(puzzle: (log: Log) => Promise<void>): Promise<string[]> {
  const output: string[] = [];
  await puzzle((message) => output.push(message));
  return output;
}

describe("预测执行顺序", () => {
  test.each(Object.keys(puzzles) as (keyof typeof puzzles)[])("%s", async (name) => {
    const prediction = predictions[name];
    expect(prediction.length, `还没有写 ${name} 的预测`).toBeGreaterThan(0);
    const actual = await run(puzzles[name]);
    // 故意不用 toEqual：它会在失败信息里把正确答案打印出来
    const correct = JSON.stringify(actual) === JSON.stringify(prediction);
    expect(
      correct,
      `${name} 的预测不对。检查一下：条数对吗？每一条的文字和谜题里完全一样吗？然后再推演一遍顺序`,
    ).toBe(true);
  });
});
