import { describe, expect, test } from "vitest";
import {
  affected,
  buildLevels,
  buildOrder,
  CycleError,
  internalDependencies,
  type WorkspacePackage,
} from "./07-build-order.ts";

// 一个像章末项目那样的工作区
const workspace: WorkspacePackage[] = [
  {
    name: "@learn-ts/harness",
    dependencies: { "@learn-ts/agent-kit": "workspace:*", zod: "^4.0.0" },
    devDependencies: { "@learn-ts/test-utils": "workspace:^" },
  },
  { name: "@learn-ts/agent-kit", devDependencies: { "@learn-ts/test-utils": "workspace:*" } },
  { name: "@learn-ts/test-utils", devDependencies: { vitest: "^5.0.0" } },
  { name: "@learn-ts/docs" },
  { name: "@learn-ts/cli", dependencies: { "@learn-ts/harness": "workspace:*" } },
];

function catchCycle(fn: () => unknown): string[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof CycleError) return error.cycle;
    throw error;
  }
  throw new Error("应该抛出 CycleError");
}

describe("internalDependencies", () => {
  test("只算 workspace: 开头的依赖，dependencies 和 devDependencies 都算", () => {
    expect(internalDependencies(workspace)).toEqual(
      new Map([
        ["@learn-ts/harness", ["@learn-ts/agent-kit", "@learn-ts/test-utils"]],
        ["@learn-ts/agent-kit", ["@learn-ts/test-utils"]],
        ["@learn-ts/test-utils", []],
        ["@learn-ts/docs", []],
        ["@learn-ts/cli", ["@learn-ts/harness"]],
      ]),
    );
  });

  test("Map 的顺序和输入一致", () => {
    expect([...internalDependencies(workspace).keys()]).toEqual(workspace.map((p) => p.name));
  });

  test("同一个依赖同时出现在两处，只算一次", () => {
    const packages = [
      { name: "a", dependencies: { b: "workspace:*" }, devDependencies: { b: "workspace:*" } },
      { name: "b" },
    ];
    expect(internalDependencies(packages).get("a")).toEqual(["b"]);
  });

  test("工作区依赖不存在", () => {
    expect(() =>
      internalDependencies([{ name: "a", dependencies: { ghost: "workspace:*" } }]),
    ).toThrow(new Error("a 依赖的 ghost 不在工作区里"));
  });

  test("npm 依赖不需要在工作区里", () => {
    expect(internalDependencies([{ name: "a", dependencies: { ghost: "^1.0.0" } }])).toEqual(
      new Map([["a", []]]),
    );
  });

  test("包名重复", () => {
    expect(() => internalDependencies([{ name: "a" }, { name: "a" }])).toThrow(
      new Error("包名重复：a"),
    );
  });
});

describe("buildLevels", () => {
  test("分批：同一批互不依赖，批内按名字排序", () => {
    expect(buildLevels(workspace)).toEqual([
      ["@learn-ts/docs", "@learn-ts/test-utils"],
      ["@learn-ts/agent-kit"],
      ["@learn-ts/harness"],
      ["@learn-ts/cli"],
    ]);
  });

  test("菱形依赖", () => {
    const packages = [
      { name: "app", dependencies: { left: "workspace:*", right: "workspace:*" } },
      { name: "right", dependencies: { base: "workspace:*" } },
      { name: "left", dependencies: { base: "workspace:*" } },
      { name: "base" },
    ];
    expect(buildLevels(packages)).toEqual([["base"], ["left", "right"], ["app"]]);
  });

  test("空工作区", () => {
    expect(buildLevels([])).toEqual([]);
  });

  test("环：从名字最小的包开始，首尾相同", () => {
    const packages = [
      { name: "c", dependencies: { a: "workspace:*" } },
      { name: "b", dependencies: { c: "workspace:*" } },
      { name: "a", dependencies: { b: "workspace:*" } },
      { name: "solo" },
    ];
    expect(catchCycle(() => buildLevels(packages))).toEqual(["a", "b", "c", "a"]);
  });

  test("环外还有依赖环的包", () => {
    const packages = [
      { name: "app", dependencies: { y: "workspace:*" } },
      { name: "x", dependencies: { y: "workspace:*" } },
      { name: "y", dependencies: { x: "workspace:*" } },
    ];
    expect(catchCycle(() => buildLevels(packages))).toEqual(["x", "y", "x"]);
  });

  test("自己依赖自己", () => {
    expect(
      catchCycle(() => buildLevels([{ name: "a", devDependencies: { a: "workspace:*" } }])),
    ).toEqual(["a", "a"]);
  });

  test("CycleError 的 message", () => {
    const packages = [
      { name: "a", dependencies: { b: "workspace:*" } },
      { name: "b", dependencies: { a: "workspace:*" } },
    ];
    expect(() => buildLevels(packages)).toThrow("依赖关系里有环：a → b → a");
  });
});

describe("buildOrder", () => {
  test("每个包都排在它的依赖之后", () => {
    const order = buildOrder(workspace);
    expect(order).toEqual([
      "@learn-ts/docs",
      "@learn-ts/test-utils",
      "@learn-ts/agent-kit",
      "@learn-ts/harness",
      "@learn-ts/cli",
    ]);
    for (const [name, deps] of internalDependencies(workspace)) {
      for (const dep of deps) {
        expect(order.indexOf(dep), `${dep} 应该在 ${name} 之前`).toBeLessThan(order.indexOf(name));
      }
    }
  });

  test("有环时同样抛出 CycleError", () => {
    const packages = [
      { name: "a", dependencies: { b: "workspace:*" } },
      { name: "b", dependencies: { a: "workspace:*" } },
    ];
    expect(() => buildOrder(packages)).toThrow(CycleError);
  });
});

describe("affected", () => {
  test("改了最底层的包：所有依赖它的包都受影响", () => {
    expect(affected(workspace, ["@learn-ts/test-utils"])).toEqual([
      "@learn-ts/test-utils",
      "@learn-ts/agent-kit",
      "@learn-ts/harness",
      "@learn-ts/cli",
    ]);
  });

  test("改了中间的包", () => {
    expect(affected(workspace, ["@learn-ts/harness"])).toEqual([
      "@learn-ts/harness",
      "@learn-ts/cli",
    ]);
  });

  test("改了没人依赖的包", () => {
    expect(affected(workspace, ["@learn-ts/docs"])).toEqual(["@learn-ts/docs"]);
  });

  test("同时改了几个包，结果按构建顺序排列、没有重复", () => {
    expect(
      affected(workspace, ["@learn-ts/cli", "@learn-ts/agent-kit", "@learn-ts/harness"]),
    ).toEqual(["@learn-ts/agent-kit", "@learn-ts/harness", "@learn-ts/cli"]);
  });

  test("不在工作区的名字忽略", () => {
    expect(affected(workspace, ["README.md"])).toEqual([]);
  });
});
