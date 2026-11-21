/**
 * 仓库自检：保证每道练习都有“题目 + 测试 + 参考答案”三件套，且题目和答案导出的名字一致。
 * 这样贡献者改了题目却忘了改答案（或反过来）时，CI 会第一时间发现。
 */
import { existsSync, globSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

// 统一成正斜杠，Windows 上 globSync 返回的是反斜杠路径
const testFiles = globSync("exercises/**/*.test.ts")
  .map((file) => file.replaceAll("\\", "/"))
  .sort();

describe("练习结构", () => {
  test("至少有一道练习", () => {
    expect(testFiles.length).toBeGreaterThan(0);
  });

  describe.each(testFiles)("%s", (testFile) => {
    const exerciseFile = testFile.replace(/\.test\.ts$/, ".ts");
    const solutionFile = exerciseFile.replace(/^exercises\//, "solutions/");

    test("题目文件和参考答案都存在", () => {
      expect(existsSync(exerciseFile), `缺少 ${exerciseFile}`).toBe(true);
      expect(existsSync(solutionFile), `缺少 ${solutionFile}`).toBe(true);
    });

    test("题目和参考答案导出相同的名字", async () => {
      const exercise: object = await import(/* @vite-ignore */ toUrl(exerciseFile));
      const solution: object = await import(/* @vite-ignore */ toUrl(solutionFile));
      expect(Object.keys(solution).sort()).toEqual(Object.keys(exercise).sort());
    });
  });
});

function toUrl(file: string): string {
  return pathToFileURL(resolve(file)).href;
}
