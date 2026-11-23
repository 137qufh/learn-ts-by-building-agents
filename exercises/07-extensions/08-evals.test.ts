import { describe, expect, test } from "vitest";
import { runEval, type EvalOutcome } from "./08-evals.ts";

const ok = (text: string, tools: string[] = []): EvalOutcome => ({
  text,
  tools,
  transcript: [{ role: "assistant", text, tools: [] }],
});

describe("runEval", () => {
  test("失败的用例不会挡住后面的，抛错也记成一条原因", async () => {
    const report = await runEval([
      {
        name: "坏了",
        expect: { textEquals: "没有" },
        run: () => Promise.reject(new Error("模型超时")),
      },
      {
        name: "好的",
        expect: { textIncludes: ["牛奶"] },
        run: () => Promise.resolve(ok("买了牛奶")),
      },
    ]);
    expect(report.passed).toBe(1);
    expect(report.failed).toEqual([{ name: "坏了", reasons: ["运行抛出了错误：模型超时"] }]);
  });

  test("文本、工具序列和记录可以同时失败", async () => {
    const report = await runEval([
      {
        name: "多项",
        expect: {
          textEquals: "期望",
          textIncludes: ["没有这段"],
          tools: ["add", "search"],
          toolsInclude: ["search", "add"],
          transcript: [
            { role: "user", text: "问", tools: [] },
            { role: "assistant", text: "答", tools: ["add"] },
          ],
        },
        run: () =>
          Promise.resolve({
            text: "实际",
            tools: ["search", "search"],
            transcript: [{ role: "assistant", text: "实际", tools: [] }],
          }),
      },
    ]);
    expect(report.passed).toBe(0);
    expect(report.failed[0]?.reasons).toEqual([
      '文本不等于预期：期望 "期望"，实际 "实际"',
      '文本没有包含 "没有这段"',
      "工具序列不等于预期：期望 add,search，实际 search,search",
      "工具序列没有按顺序包含 search → add，实际 search,search",
      "记录长度不同：期望 2 步，实际 1 步",
    ]);
  });

  test("工具子序列允许夹杂；记录逐步比较", async () => {
    const good = await runEval([
      {
        name: "顺序",
        expect: { toolsInclude: ["search", "add"], tools: ["search", "note", "add"] },
        run: () => Promise.resolve(ok("好", ["search", "note", "add"])),
      },
    ]);
    expect(good).toEqual({ passed: 1, failed: [] });

    const bad = await runEval([
      {
        name: "记录",
        expect: { transcript: [{ role: "assistant", text: "对", tools: ["add"] }] },
        run: () =>
          Promise.resolve({
            text: "对",
            tools: ["add"],
            transcript: [{ role: "assistant", text: "对", tools: [] }],
          }),
      },
    ]);
    expect(bad.failed[0]?.reasons).toEqual(["记录第 0 步不符合预期"]);
  });
});
