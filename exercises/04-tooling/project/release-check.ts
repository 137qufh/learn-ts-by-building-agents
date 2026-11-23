/**
 * 第 4 章项目：发布前检查
 *
 * 课程：chapters/04-tooling/09-project-agent-kit.md
 * 运行：pnpm ex release-check
 *
 * packages/agent-kit 是本章打包出来的 @learn-ts/agent-kit。它能被仓库里的代码导入，
 * 不代表它作为一个"包"是合格的：exports 指向的文件可能没被打包，类型可能找不到，
 * 编译出来的 .js 可能根本跑不起来。这个脚本像一个真正的用户那样检查它。
 *
 * 用到了你在练习 4-3 里写的 lintPackage，请先完成它。
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { todo } from "../../todo.ts";
import { lintPackage, type PackageManifest } from "../03-package-lint.ts";

// ── 已经写好的辅助代码 ────────────────────────────────────────────────

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** 运行一个命令，等它结束。不管退出码是多少都不会抛错，由调用方检查 code */
export function run(command: string, args: readonly string[], cwd: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      // Windows 上 npm 是一个 .cmd 脚本，必须通过 shell 运行
      shell: process.platform === "win32" && command === "npm",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

const require = createRequire(import.meta.url);
/** 仓库根目录 */
export const repoRoot: string = join(import.meta.dirname, "../../..");
/** TypeScript 7 的 tsc 脚本，用 `run(process.execPath, [tscScript, ...], cwd)` 运行 */
export const tscScript: string = join(
  dirname(require.resolve("typescript7/package.json")),
  "bin/tsc",
);

/** 读取并解析 root 目录下的 package.json */
export function readManifest(root: string): PackageManifest {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as PackageManifest;
}

// ── 第一步：会被打包的文件 ────────────────────────────────────────────

/**
 * 返回 `npm pack` 会打包的文件列表（相对于包根目录，比如 "dist/index.js"），按字符串排序。
 *
 * 用 `npm pack --dry-run --json --ignore-scripts`：
 * - --dry-run：只列出文件，不生成 .tgz
 * - --json：输出 JSON，格式是 [{ files: [{ path: "dist/index.js", ... }, ...], ... }]
 * - --ignore-scripts：不运行 prepack 等脚本（构建由调用方负责）
 *
 * 命令失败（退出码不是 0）时抛出 Error，message 是 `npm pack 失败：${stderr}`。
 */
export async function packedFiles(root: string): Promise<string[]> {
  return todo("实现 packedFiles");
}

// ── 第二步：检查 package.json ─────────────────────────────────────────

/** 用练习 4-3 的 lintPackage 检查 root 目录下的包 */
export async function checkManifest(root: string): Promise<string[]> {
  return todo("实现 checkManifest");
}

// ── 第三步：像用户一样用一次 ──────────────────────────────────────────

export interface SmokeResult {
  /** tsc 报告的错误，每条一行，形如 "index.ts(3,7): error TS2322: ..." */
  typeErrors: string[];
  /** node index.ts 的退出码，0 表示成功 */
  exitCode: number;
  /** node index.ts 的标准输出 */
  stdout: string;
  /** node index.ts 的标准错误输出 */
  stderr: string;
}

/**
 * 把 root 目录下的包打包、安装到一个全新的临时项目里，再在那个项目里运行 code。
 *
 * 1. 建两个临时目录（mkdtempSync(join(tmpdir(), "...")）：一个放 .tgz，一个是"用户项目"
 * 2. `npm pack --json --ignore-scripts --pack-destination <放 tgz 的目录>`，
 *    输出的 JSON 里 [0].filename 是生成的文件名
 * 3. "安装"：在用户项目里建 node_modules/<包名>（包名可能带作用域，比如 @learn-ts/agent-kit），
 *    然后 `tar -xzf <tgz> -C <那个目录> --strip-components=1`（tgz 里的文件都在 package/ 下面）
 * 4. 在用户项目里写三个文件：
 *    - package.json：{ "type": "module" }
 *    - index.ts：code
 *    - tsconfig.json：compilerOptions 为 module "nodenext"、strict true、noEmit true、
 *      types ["node"]、typeRoots [仓库根目录下的 node_modules/@types]（用户项目里没装 @types/node），
 *      files ["index.ts"]
 * 5. 运行 tsc（-p <用户项目>），从输出里收集包含 "error TS" 的行，作为 typeErrors
 * 6. 用 node 运行 index.ts（cwd 是用户项目），记下退出码、stdout 和 stderr
 * 7. 无论成功失败，最后都删掉两个临时目录
 *
 * 类型错误和运行失败都不抛错，而是放在结果里：两者可能同时存在，都要报告。
 * 只有打包、解压这些"检查本身没法进行"的失败才抛出 Error：打包失败的 message 和 packedFiles 一样，
 * 是 `npm pack 失败：${stderr}`；解压失败是 `解压失败：${stderr}`。
 *
 * 注意：这里没有任何自定义条件，所以用户拿到的是 dist 里的编译产物和 .d.ts，和真实用户一样。
 */
export async function smokeTest(root: string, code: string): Promise<SmokeResult> {
  return todo("实现 smokeTest");
}

// ── 第四步：全部串起来 ────────────────────────────────────────────────

/**
 * 发布前检查，返回发现的全部问题，没有问题时返回空数组：
 * 1. checkManifest 的问题，原样放进结果
 * 2. 用 smokeCode 做 smokeTest：
 *    - 每条类型错误：`类型检查失败：${那一行}`
 *    - 运行失败（退出码不是 0）：`运行失败：${去掉首尾空白的 stderr}`
 *    - smokeTest 抛错（打包失败、解压失败……）：`冒烟测试失败：${错误的 message}`
 *
 * 第 1 步发现问题时，第 2 步照样要做：一次把问题都报告出来，省得改一个跑一次。
 */
export async function releaseCheck(root: string, smokeCode: string): Promise<string[]> {
  return todo("实现 releaseCheck");
}
