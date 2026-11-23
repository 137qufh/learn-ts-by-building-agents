import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createToolbox } from "@learn-ts/agent-kit/zod";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { SandboxError, createFileTools, isInside, resolveInSandbox } from "./sandbox.ts";

let base: string; // 临时目录，里面有 sandbox/ 和 sandbox 外面的 secret.txt
let root: string;

beforeAll(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "learn-ts-sandbox-")));
  root = join(base, "sandbox");
  mkdirSync(join(root, "src", "deep"), { recursive: true });
  mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(root, "README.md"), "# 示例项目\nTODO: 写文档\n");
  writeFileSync(
    join(root, "src", "main.ts"),
    'const a = 1;\n// TODO: 处理错误\nconsole.log("hi");\n',
  );
  writeFileSync(join(root, "src", "deep", "util.ts"), "export const TODO_LIST = [];\n");
  writeFileSync(join(root, "node_modules", "pkg", "index.js"), "// TODO: 不应该被搜到\n");
  writeFileSync(join(root, "empty.txt"), "");
  writeFileSync(join(base, "secret.txt"), "TODO: 密码是 123\n");
  mkdirSync(join(base, "sandbox-evil"));
  writeFileSync(join(base, "sandbox-evil", "x.txt"), "evil\n");
  symlinkSync(join(base, "secret.txt"), join(root, "link-out.txt"));
  symlinkSync(base, join(root, "link-dir"));
  symlinkSync(join(root, "README.md"), join(root, "link-in.md"));
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("isInside", () => {
  test("自己和子路径在里面；父目录、兄弟、前缀相同的目录不在", () => {
    expect(isInside("/a/b", "/a/b")).toBe(true);
    expect(isInside("/a/b", "/a/b/c/d")).toBe(true);
    expect(isInside("/a/b", "/a/b/..c")).toBe(true); // 名字以 .. 开头的文件，不是父目录
    expect(isInside("/a/b", "/a")).toBe(false);
    expect(isInside("/a/b", "/a/c")).toBe(false);
    expect(isInside("/a/b", "/a/bc")).toBe(false);
  });
});

describe("resolveInSandbox", () => {
  test("相对路径解析到工作目录里，返回真实的绝对路径", async () => {
    expect(await resolveInSandbox(root, "src/main.ts")).toBe(join(root, "src", "main.ts"));
    expect(await resolveInSandbox(root, ".")).toBe(root);
    expect(await resolveInSandbox(root, "src/../README.md")).toBe(join(root, "README.md"));
  });

  test("工作目录里面的绝对路径也可以", async () => {
    expect(await resolveInSandbox(root, join(root, "README.md"))).toBe(join(root, "README.md"));
  });

  test("还不存在的文件（给 write_file 用）：检查它最近的已经存在的祖先", async () => {
    expect(await resolveInSandbox(root, "new/dir/file.txt")).toBe(
      join(root, "new", "dir", "file.txt"),
    );
  });

  test("跑出工作目录：.. 、外面的绝对路径、前缀相同的兄弟目录", async () => {
    for (const path of [
      "../secret.txt",
      "src/../../secret.txt",
      join(base, "secret.txt"),
      "/etc/passwd",
      "../sandbox-evil/x.txt",
    ]) {
      await expect(resolveInSandbox(root, path), path).rejects.toThrow(SandboxError);
    }
    await expect(resolveInSandbox(root, "../secret.txt")).rejects.toThrow(
      "路径 ../secret.txt 在工作目录之外",
    );
  });

  test("符号链接指向外面：拒绝；指向里面：可以", async () => {
    await expect(resolveInSandbox(root, "link-out.txt")).rejects.toThrow(
      "路径 link-out.txt 通过符号链接指向了工作目录之外",
    );
    await expect(resolveInSandbox(root, "link-dir/secret.txt")).rejects.toThrow(SandboxError);
    await expect(resolveInSandbox(root, "link-dir/new-file.txt")).rejects.toThrow(SandboxError); // 不存在的文件也一样
    expect(await resolveInSandbox(root, "link-in.md")).toBe(join(root, "README.md"));
  });

  test("空路径、NUL 字符", async () => {
    await expect(resolveInSandbox(root, "  ")).rejects.toThrow("路径不能为空");
    await expect(resolveInSandbox(root, "a\0b")).rejects.toThrow("路径里不能有 NUL 字符");
  });

  test("SandboxError 是 Error，name 是 SandboxError", () => {
    const error = new SandboxError("x");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SandboxError");
  });
});

describe("createFileTools", () => {
  const box = () => createToolbox(createFileTools(root, { allowWrite: true }));
  const dispatch = async (name: string, args: unknown) =>
    box().dispatch({ id: "c1", name, arguments: JSON.stringify(args) });

  test("默认只读：没有 write_file", () => {
    expect(createToolbox(createFileTools(root)).names()).toEqual([
      "list_files",
      "read_file",
      "search",
    ]);
    expect(box().names()).toEqual(["list_files", "read_file", "search", "write_file"]);
  });

  test("list_files：排好序，目录以 / 结尾；默认列出工作目录", async () => {
    expect(await dispatch("list_files", { path: "src" })).toEqual({
      id: "c1",
      ok: true,
      content: "deep/\nmain.ts",
    });
    const top = await dispatch("list_files", {});
    expect(top.content.split("\n")).toEqual([
      "README.md",
      "empty.txt",
      "link-dir",
      "link-in.md",
      "link-out.txt",
      "node_modules/",
      "src/",
    ]);
  });

  test("read_file：带行号；只读一部分时说明总行数", async () => {
    expect((await dispatch("read_file", { path: "src/main.ts" })).content).toBe(
      '1: const a = 1;\n2: // TODO: 处理错误\n3: console.log("hi");',
    );
    expect(
      (await dispatch("read_file", { path: "src/main.ts", startLine: 2, maxLines: 1 })).content,
    ).toBe("（共 3 行，显示第 2-2 行）\n2: // TODO: 处理错误");
    expect((await dispatch("read_file", { path: "empty.txt" })).content).toBe("（空文件）");
  });

  test("read_file 的错误变成给模型看的文本", async () => {
    const outside = await dispatch("read_file", { path: "../secret.txt" });
    expect(outside).toEqual({
      id: "c1",
      ok: false,
      content: "工具执行失败：路径 ../secret.txt 在工作目录之外",
    });
    expect((await dispatch("read_file", { path: "src" })).content).toBe(
      "工具执行失败：src 不是文件",
    );
    expect((await dispatch("read_file", { path: "src/main.ts", startLine: 9 })).content).toBe(
      "工具执行失败：文件只有 3 行，startLine 是 9",
    );
    expect((await dispatch("read_file", { path: "nope.txt" })).ok).toBe(false);
  });

  test("read_file：超过大小上限的文件不读", async () => {
    const small = createToolbox(createFileTools(root, { maxFileBytes: 10 }));
    const result = await small.dispatch({
      id: "c1",
      name: "read_file",
      arguments: '{"path":"README.md"}',
    });
    expect(result.content).toMatch(/^工具执行失败：README\.md 有 \d+ 字节，超过了 10 字节的上限$/);
  });

  test("search：按路径排序，跳过 node_modules，不跟随符号链接", async () => {
    expect((await dispatch("search", { query: "TODO" })).content).toBe(
      [
        "README.md:2: TODO: 写文档",
        "src/deep/util.ts:1: export const TODO_LIST = [];",
        "src/main.ts:2: // TODO: 处理错误",
      ].join("\n"),
    );
    expect((await dispatch("search", { query: "TODO", path: "src/deep" })).content).toBe(
      "src/deep/util.ts:1: export const TODO_LIST = [];",
    );
    expect((await dispatch("search", { query: "找不到的东西" })).content).toBe(
      '没有找到 "找不到的东西"',
    );
    expect((await dispatch("search", { query: "x", path: "README.md" })).content).toBe(
      "工具执行失败：README.md 是文件，search 的 path 应该是目录",
    );
  });

  test("write_file：写入并自动创建目录；不能写到外面", async () => {
    expect(await dispatch("write_file", { path: "notes/todo.md", content: "你好" })).toEqual({
      id: "c1",
      ok: true,
      content: "已写入 notes/todo.md（6 字节）",
    });
    expect(readFileSync(join(root, "notes", "todo.md"), "utf8")).toBe("你好");
    expect((await dispatch("write_file", { path: "../escape.txt", content: "x" })).ok).toBe(false);
    expect((await dispatch("write_file", { path: "link-dir/escape.txt", content: "x" })).ok).toBe(
      false,
    );
  });
});
