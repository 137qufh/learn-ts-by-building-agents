import { defineConfig, type Plugin } from "vitest/config";

/**
 * 两种运行模式：
 *
 * - 默认（`pnpm ex`）：只跑 exercises/ 下的测试，测试导入的是你自己写的练习文件。
 *   没做完的练习会失败，这是故意的：把它们一个个变绿就是你的任务。
 *   从第 2 章开始还有类型测试（*.test-d.ts）：它们不会运行，而是交给 tsc 检查，
 *   类型不对就算失败。
 *
 * - solutions 模式（`pnpm test`，CI 也用这个）：跑全部测试，并且把练习测试里对
 *   exercises/ 的导入悄悄换成 solutions/ 里的参考答案，用来证明“题目 + 答案 + 测试”
 *   三者是一致的。类型测试没法这样改写导入，改由 tests/type-exercises.test.ts 检查。
 */
export default defineConfig(({ mode }) => {
  const useSolutions = mode === "solutions";

  return {
    plugins: useSolutions ? [redirectExercisesToSolutions()] : [],
    test: {
      include: useSolutions
        ? ["chapters/**/*.test.ts", "exercises/**/*.test.ts", "tests/**/*.test.ts"]
        : ["exercises/**/*.test.ts"],
      // 少数测试需要知道自己在检查哪个目录（比如练习 4-5 要对练习文件本身运行 ESLint）
      env: { LEARN_TS_MODE: useSolutions ? "solutions" : "exercises" },
      typecheck: {
        enabled: !useSolutions,
        include: ["exercises/**/*.test-d.ts"],
        tsconfig: "exercises/tsconfig.json",
      },
    },
  };
});

// Vite 内部统一使用正斜杠路径（Windows 上也是），所以这里不用 path.sep。
const EXERCISES_DIR = "/exercises/";
const SOLUTIONS_DIR = "/solutions/";

/** 只改写“练习测试文件 → 练习文件”这一种导入，其他导入一律不动。 */
function redirectExercisesToSolutions(): Plugin {
  return {
    name: "redirect-exercises-to-solutions",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer?.includes(EXERCISES_DIR) || !importer.endsWith(".test.ts")) {
        return null;
      }
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || resolved.external || !resolved.id.includes(EXERCISES_DIR)) {
        return null;
      }
      return { ...resolved, id: resolved.id.replace(EXERCISES_DIR, SOLUTIONS_DIR) };
    },
  };
}
