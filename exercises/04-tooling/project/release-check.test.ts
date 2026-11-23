import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  checkManifest,
  packedFiles,
  releaseCheck,
  repoRoot,
  run,
  smokeTest,
  tscScript,
} from "./release-check.ts";

const agentKit = join(repoRoot, "packages/agent-kit");

/** 一段像用户一样使用 @learn-ts/agent-kit 的代码 */
const usage = `
import { createRegistry, defineTool } from "@learn-ts/agent-kit";
import { createFakeOpenAI, textReply } from "@learn-ts/agent-kit/testing";

const echo = defineTool({
  name: "echo",
  description: "原样返回",
  parameters: { text: { type: "string" } },
  execute: ({ text }) => text,
});
const registry = createRegistry().register(echo);
const result: string = registry.call("echo", { text: "你好" });
console.log(result, registry.names().join(","), typeof createFakeOpenAI([textReply("x")]).fetch);
`;

// 先构建：检查的是 dist 里的编译产物
beforeAll(async () => {
  const built = await run(process.execPath, [tscScript, "-p", "tsconfig.build.json"], agentKit);
  expect(built.stdout + built.stderr).toBe("");
}, 60_000);

describe("packedFiles", { timeout: 60_000 }, () => {
  test("agent-kit 会打包编译产物、类型声明和源码，不会打包测试", async () => {
    const files = await packedFiles(agentKit);
    expect(files).toEqual([...files].sort());
    for (const file of [
      "package.json",
      "dist/index.js",
      "dist/index.d.ts",
      "dist/index.d.ts.map",
      "dist/testing/fake-openai.js",
      "src/index.ts",
    ]) {
      expect(files).toContain(file);
    }
    expect(files.some((file) => file.startsWith("test/"))).toBe(false);
  });

  test("目录不是一个包时抛错", async () => {
    const empty = mkdtempSync(join(tmpdir(), "not-a-package-"));
    try {
      await expect(packedFiles(empty)).rejects.toThrow(/^npm pack 失败：/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("checkManifest", { timeout: 60_000 }, () => {
  test("agent-kit 没有问题", async () => {
    expect(await checkManifest(agentKit)).toEqual([]);
  });
});

describe("smokeTest", { timeout: 60_000 }, () => {
  test("像用户一样导入、类型检查、运行", async () => {
    const result = await smokeTest(agentKit, usage);
    expect(result).toEqual({
      typeErrors: [],
      exitCode: 0,
      stdout: "你好 echo function\n",
      stderr: "",
    });
  });

  test("类型错误被收集起来", async () => {
    const result = await smokeTest(
      agentKit,
      `import { createRegistry } from "@learn-ts/agent-kit";\nconst names: number = createRegistry().names().length + "";\nconsole.log(names);\n`,
    );
    expect(result.typeErrors).toHaveLength(1);
    expect(result.typeErrors[0]).toMatch(/^index\.ts\(2,7\): error TS2322/);
  });

  test("用户拿到的是 dist，不是源码", async () => {
    const result = await smokeTest(
      agentKit,
      `console.log(import.meta.resolve("@learn-ts/agent-kit").endsWith("/dist/index.js"));\n`,
    );
    expect(result.stdout).toBe("true\n");
  });

  test("运行失败不抛错，记录在结果里", async () => {
    const result = await smokeTest(
      agentKit,
      `import { nope } from "@learn-ts/agent-kit";\nconsole.log(nope);\n`,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/nope/);
    expect(result.typeErrors).toEqual([expect.stringMatching(/error TS2305/)]);
  });

  test("打包失败时抛错", async () => {
    const empty = mkdtempSync(join(tmpdir(), "not-a-package-"));
    try {
      await expect(smokeTest(empty, "")).rejects.toThrow(/^npm pack 失败：/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("releaseCheck", { timeout: 60_000 }, () => {
  test("agent-kit 可以发布", async () => {
    expect(await releaseCheck(agentKit, usage)).toEqual([]);
  });

  describe("一个有问题的包", () => {
    let broken: string;
    beforeAll(() => {
      broken = mkdtempSync(join(tmpdir(), "broken-package-"));
      const write = (path: string, content: string): void => {
        mkdirSync(join(broken, path, ".."), { recursive: true });
        writeFileSync(join(broken, path), content);
      };
      write(
        "package.json",
        JSON.stringify({
          name: "@demo/broken",
          version: "1.0.0",
          type: "module",
          exports: { ".": { default: "./dist/index.js", types: "./dist/index.d.ts" } },
          files: ["dist"],
        }),
      );
      // 声明文件说 greet 返回 number，实现却返回字符串；而且 index.js 引用了一个没被打包的文件
      write("dist/index.js", `export { greet } from "./greet.js";\n`);
      write("dist/index.d.ts", `export declare function greet(name: string): number;\n`);
    });
    afterAll(() => {
      rmSync(broken, { recursive: true, force: true });
    });

    test("一次报告所有问题", async () => {
      const problems = await releaseCheck(
        broken,
        `import { greet } from "@demo/broken";\nconst s: string = greet("x");\nconsole.log(s);\n`,
      );
      expect(problems).toEqual([
        ".: types 条件必须写在 import/require/node/default 之前",
        ".: default 条件必须写在最后",
        expect.stringMatching(/^类型检查失败：index\.ts\(2,7\): error TS2322/),
        expect.stringMatching(/^运行失败：.*greet\.js/s),
      ]);
    });
  });
});
