import { describe, expect, test } from "vitest";
import { compareBaseline, parseJudge } from "./09-judge.ts";

describe("parseJudge", () => {
  test("代码块里的 JSON 按量表排序，mean 不取整", () => {
    const judged = parseJudge(
      '说明如下\n```json\n{"scores":[{"criterion":"完整","score":0,"reason":"漏了"},{"criterion":"准确","score":2,"reason":"对了"}]}\n```\n以上',
      ["准确", "完整"],
    );
    expect(judged).toEqual({
      ok: true,
      scores: [
        { criterion: "准确", score: 2, reason: "对了" },
        { criterion: "完整", score: 0, reason: "漏了" },
      ],
      mean: 1,
    });
  });

  test("字符串分数、缺项、多余项、重复项、空理由都拒绝", () => {
    expect(parseJudge("没有", ["准确"])).toEqual({
      ok: false,
      error: "无法解析评测结果：找不到 JSON 对象",
    });
    expect(
      parseJudge('{"scores":[{"criterion":"准确","score":"2","reason":"对"}]}', ["准确"]).ok,
    ).toBe(false);
    expect(
      parseJudge('{"scores":[{"criterion":"准确","score":2,"reason":" "}]}', ["准确"]),
    ).toEqual({
      ok: false,
      error: '评分项 "准确" 缺少理由',
    });
    const missingScores = parseJudge('{"nope":1}', ["准确"]);
    expect(missingScores.ok).toBe(false);
    if (!missingScores.ok) expect(missingScores.error).toBe("评测结果缺少 scores");
    expect(
      parseJudge('{"scores":[{"criterion":"准确","score":2,"reason":"对"}]}', ["准确", "完整"]),
    ).toEqual({ ok: false, error: '缺少评分项 "完整"' });
    expect(
      parseJudge(
        '{"scores":[{"criterion":"准确","score":2,"reason":"对"},{"criterion":"多余","score":1,"reason":"x"}]}',
        ["准确"],
      ),
    ).toEqual({ ok: false, error: '多余的评分项 "多余"' });
    expect(
      parseJudge(
        '{"scores":[{"criterion":"准确","score":1,"reason":"a"},{"criterion":"准确","score":2,"reason":"b"}]}',
        ["准确"],
      ),
    ).toEqual({ ok: false, error: '评分项 "准确" 重复了' });
    expect(
      parseJudge('{"scores":[{"criterion":"准确","score":3,"reason":"太高"}]}', ["准确"]),
    ).toEqual({
      ok: false,
      error: '评分项 "准确" 的分数必须是 0、1 或 2',
    });
    expect(
      parseJudge('{"scores":[{"criterion":"准确","score":1.5,"reason":"半"}]}', ["准确"]).ok,
    ).toBe(false);
  });
});

describe("compareBaseline", () => {
  test("下降超过容忍度才算回归；缺了用例也要报；新用例不算", () => {
    expect(
      compareBaseline(
        [
          { name: "总结", mean: 1.9 },
          { name: "检索", mean: 1 },
          { name: "新的", mean: 2 },
        ],
        [
          { name: "总结", mean: 2 },
          { name: "检索", mean: 2 },
          { name: "旧的", mean: 1 },
        ],
        0.2,
      ),
    ).toEqual({
      ok: false,
      regressions: [{ name: "检索", before: 2, after: 1, delta: -1 }],
      missing: ["旧的"],
    });
    expect(compareBaseline([{ name: "总结", mean: 2 }], [{ name: "总结", mean: 2 }])).toEqual({
      ok: true,
    });
    // 下降刚好等于容忍度，不算回归；超过才算
    expect(compareBaseline([{ name: "总结", mean: 1 }], [{ name: "总结", mean: 2 }], 1)).toEqual({
      ok: true,
    });
    expect(compareBaseline([{ name: "总结", mean: 0 }], [{ name: "总结", mean: 2 }], 1)).toEqual({
      ok: false,
      regressions: [{ name: "总结", before: 2, after: 0, delta: -2 }],
      missing: [],
    });
  });

  test("非法的容忍度、均值和重复名字", () => {
    expect(() => compareBaseline([], [], -0.1)).toThrow(RangeError);
    expect(() => compareBaseline([{ name: "a", mean: Number.NaN }], [])).toThrow(RangeError);
    expect(() =>
      compareBaseline(
        [
          { name: "a", mean: 1 },
          { name: "a", mean: 2 },
        ],
        [],
      ),
    ).toThrow(/a/);
  });
});
