import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, test, vi } from "vitest";
import {
  describeEvent,
  filterAllowed,
  finishTurn,
  parseToolCall,
  withTimeout,
  type Policy,
  type TranscriptStore,
} from "./05-lint-fixes.ts";

// pnpm ex 检查你的练习文件，pnpm test 检查参考答案（见 vitest.config.ts）
const directory = process.env.LEARN_TS_MODE === "solutions" ? "solutions" : "exercises";
const root = join(import.meta.dirname, "../..");
const target = join(root, directory, "04-tooling/05-lint-fixes.ts");

describe("ESLint", () => {
  test("没有任何报告", { timeout: 60_000 }, async () => {
    // ignore: false：exercises/ 平时被忽略，这里要检查它
    const eslint = new ESLint({ cwd: root, ignore: false });
    const [result] = await eslint.lintFiles([target]);
    const messages = (result?.messages ?? []).map(
      (message) => `第 ${message.line} 行 ${message.ruleId ?? ""}：${message.message}`,
    );
    expect(messages).toEqual([]);
  });

  test("没有用禁用规则的注释让 ESLint 闭嘴", () => {
    expect(readFileSync(target, "utf8")).not.toMatch(/eslint-disable/);
  });
});

describe("describeEvent", () => {
  test.each([
    [{ type: "text", text: "你好" } as const, "你好"],
    [
      { type: "tool_call", call: { name: "search", args: { q: "ts" } } } as const,
      '调用 search({"q":"ts"})',
    ],
    [{ type: "tool_result", name: "search", ok: true } as const, "search 成功"],
    [{ type: "tool_result", name: "fetch", ok: false } as const, "fetch 失败"],
    [{ type: "done" } as const, "完成"],
  ])("%j", (event, expected) => {
    expect(describeEvent(event)).toBe(expected);
  });
});

describe("filterAllowed", () => {
  test("等每个检查完成，保持原来的顺序", async () => {
    const policy: Policy = {
      isAllowed: async (tool) => {
        await new Promise((resolve) => setTimeout(resolve, tool === "read" ? 5 : 1));
        return tool !== "delete";
      },
    };
    expect(await filterAllowed(["read", "delete", "search"], policy)).toEqual(["read", "search"]);
  });
});

describe("finishTurn", () => {
  test("返回之前已经保存好了", async () => {
    const saved: string[][] = [];
    const store: TranscriptStore = {
      save: async (lines) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        saved.push([...lines]);
      },
    };
    expect(await finishTurn(["a", "b"], store)).toBe(2);
    expect(saved).toEqual([["a", "b"]]);
  });

  test("保存失败时，返回的 Promise 也失败", async () => {
    const store: TranscriptStore = { save: () => Promise.reject(new Error("磁盘满了")) };
    await expect(finishTurn(["a"], store)).rejects.toThrow("磁盘满了");
  });
});

describe("withTimeout", () => {
  test("按时完成", async () => {
    await expect(withTimeout(Promise.resolve(42), 100)).resolves.toBe(42);
  });

  test("超时时以 Error 拒绝", async () => {
    vi.useFakeTimers();
    try {
      const result = withTimeout(new Promise(() => {}), 100);
      const assertion = expect(result).rejects.toThrow(new Error("超时：100ms"));
      await vi.advanceTimersByTimeAsync(100);
      await assertion;
      await expect(result).rejects.toBeInstanceOf(Error);
    } finally {
      vi.useRealTimers();
    }
  });

  test("原来的 Promise 失败时，原样传递错误", async () => {
    const error = new Error("网络错误");
    await expect(withTimeout(Promise.reject(error), 100)).rejects.toBe(error);
  });
});

describe("parseToolCall", () => {
  test("合法的输入", () => {
    expect(parseToolCall('{"name":"search","args":{"q":"ts"}}')).toEqual({
      name: "search",
      args: { q: "ts" },
    });
    expect(parseToolCall('{"name":"now"}')).toEqual({ name: "now", args: {} });
  });

  test.each([
    "不是 JSON",
    "null",
    '"search"',
    "{}",
    '{"name":""}',
    '{"name":42}',
    '{"name":"search","args":null}',
    '{"name":"search","args":[1,2]}',
    '{"name":"search","args":"q=ts"}',
  ])("不合法：%s", (text) => {
    expect(() => parseToolCall(text)).toThrow(new Error("工具调用格式不对"));
  });
});
