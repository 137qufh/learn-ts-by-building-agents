// 4.3 打包一个库
// 运行：pnpm tsx chapters/04-tooling/examples/03-publishing.ts
//
// 在临时目录里写一个最小的库，用 tsc 编译出 .js 和 .d.ts，再用 npm pack --dry-run 看看会发布哪些文件。

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const root = mkdtempSync(join(tmpdir(), "publishing-demo-"));
function write(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

write(
  "package.json",
  JSON.stringify(
    {
      name: "tiny-greeter",
      version: "1.0.0",
      type: "module",
      exports: {
        ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
        "./package.json": "./package.json",
      },
      files: ["dist", "src"],
      engines: { node: ">=22.12" },
    },
    null,
    2,
  ),
);
write(
  "tsconfig.json",
  JSON.stringify({
    compilerOptions: {
      target: "es2025",
      module: "nodenext",
      strict: true,
      rootDir: "src",
      outDir: "dist",
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      rewriteRelativeImportExtensions: true,
      isolatedDeclarations: true,
      verbatimModuleSyntax: true,
      erasableSyntaxOnly: true,
      types: [],
    },
    include: ["src"],
  }),
);
write(
  "src/greet.ts",
  `export interface GreetOptions {
  /** 称呼前面加的词，默认"你好" */
  greeting?: string;
}

export function greet(name: string, options: GreetOptions = {}): string {
  return \`\${options.greeting ?? "你好"}，\${name}\`;
}
`,
);
write("src/index.ts", `export { greet, type GreetOptions } from "./greet.ts";\n`);
write("src/greet.test.ts", `// 测试文件：不应该被发布\n`);
write("README.md", "# tiny-greeter\n");

// 用仓库里装的 tsc（TypeScript 7）编译
const require = createRequire(import.meta.url);
const tsc = join(dirname(require.resolve("typescript7/package.json")), "bin", "tsc");
execFileSync(process.execPath, [tsc, "-p", root], { stdio: "inherit" });

console.log("── dist/ 里的文件 ──");
console.log(readdirSync(join(root, "dist")).sort().join("\n"));

console.log("\n── dist/index.js：.ts 扩展名被改写成了 .js ──");
console.log(readFileSync(join(root, "dist/index.js"), "utf8"));

console.log("── dist/greet.d.ts：只剩类型，没有实现 ──");
console.log(readFileSync(join(root, "dist/greet.d.ts"), "utf8"));

// 编译产物可以直接被 Node 使用
const { greet } = (await import(pathToFileURL(join(root, "dist/index.js")).href)) as {
  greet: (name: string) => string;
};
console.log(greet("TypeScript")); // 你好，TypeScript

function packedFiles(): string {
  const result = JSON.parse(
    execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      shell: process.platform === "win32",
    }),
  ) as { files: { path: string }[] }[];
  return (result[0]?.files ?? [])
    .map((file) => file.path)
    .sort()
    .join("\n");
}

console.log("\n── npm pack --dry-run：会被打进包里的文件 ──");
console.log(packedFiles());
// 测试文件混进来了：tsc 把 src/greet.test.ts 也编译了，files 里的 "src" 又把源码目录整个带上。

// 修正：编译时排除测试文件，files 里用 "!" 排除源码目录里的测试
const config = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8")) as Record<
  string,
  unknown
>;
write("tsconfig.json", JSON.stringify({ ...config, exclude: ["src/**/*.test.ts"] }));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<
  string,
  unknown
>;
write("package.json", JSON.stringify({ ...manifest, files: ["dist", "src", "!src/**/*.test.ts"] }));
rmSync(join(root, "dist"), { recursive: true });
execFileSync(process.execPath, [tsc, "-p", root], { stdio: "inherit" });

console.log("\n── 修正之后 ──");
console.log(packedFiles());

rmSync(root, { recursive: true, force: true });
