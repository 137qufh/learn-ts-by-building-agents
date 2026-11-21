import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { statusLine, withColor } from "./04-colors.ts";
import { isEnabled, strip } from "./vendor/ansi-lite.js";

const ESC = "\u001b[";

describe("statusLine", () => {
  test("关掉颜色时的文字", () => {
    withColor(false, () => {
      expect(statusLine("search", "running")).toBe("… search");
      expect(statusLine("search", "running", "被忽略")).toBe("… search");
      expect(statusLine("search", "ok")).toBe("✓ search");
      expect(statusLine("search", "ok", "12ms")).toBe("✓ search 12ms");
      expect(statusLine("search", "error")).toBe("✗ search");
      expect(statusLine("search", "error", "超时")).toBe("✗ search: 超时");
    });
  });

  test("颜色代码", () => {
    withColor(true, () => {
      expect(statusLine("search", "running")).toBe(`${ESC}90m…${ESC}39m search`);
      expect(statusLine("search", "ok", "12ms")).toBe(
        `${ESC}32m✓${ESC}39m search ${ESC}2m12ms${ESC}22m`,
      );
      expect(statusLine("fetch", "error", "超时")).toBe(
        `${ESC}31m✗${ESC}39m ${ESC}1mfetch${ESC}22m: ${ESC}31m超时${ESC}39m`,
      );
    });
  });

  test("去掉颜色后和关掉颜色时一样", () => {
    const colored = withColor(true, () => statusLine("fetch", "error", "超时"));
    const plain = withColor(false, () => statusLine("fetch", "error", "超时"));
    expect(strip(colored)).toBe(plain);
  });
});

describe("withColor", () => {
  test("返回 fn 的结果，结束后恢复原来的设置", () => {
    expect(isEnabled()).toBe(true);
    expect(withColor(false, () => isEnabled())).toBe(false);
    expect(isEnabled()).toBe(true);
    expect(withColor(false, () => withColor(true, () => isEnabled()))).toBe(true);
    expect(isEnabled()).toBe(true);
  });

  test("fn 抛错时也恢复", () => {
    expect(() =>
      withColor(false, () => {
        throw new Error("出错了");
      }),
    ).toThrow("出错了");
    expect(isEnabled()).toBe(true);
  });
});

test("vendor/ansi-lite.js 和参考答案里的那份一模一样（题目给的库不能改）", () => {
  const root = join(import.meta.dirname, "../..");
  const read = (dir: string): string =>
    readFileSync(join(root, dir, "04-tooling/vendor/ansi-lite.js"), "utf8");
  expect(read("exercises")).toBe(read("solutions"));
});
