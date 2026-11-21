// ESLint 配置。每一项的理由见 chapters/04-tooling/05-linting.md。
//
// 运行：pnpm lint（等价于 eslint .）。类型感知的规则需要类型信息，
// typescript-eslint 通过 TypeScript 6 的 API 读取它（为什么是 6 而不是 7，见 4.5 节）。
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "**/node_modules/",
      "**/dist/",
      ".solutions-typecheck/",
      // 练习目录是学习者自己的工作区：题目里的 todo() 和 any 占位必然违反规则。
      // 想检查自己的答案，运行 pnpm exec eslint --no-ignore exercises/某个文件.ts
      "exercises/",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // 每个文件使用离它最近的 tsconfig.json 获取类型信息，和编辑器的行为一致
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // 以下划线开头的名字表示"故意不用"，比如用解构去掉一个属性：const { user: _user, ...rest } = x
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // 没有 await 的 async 函数仍然有意义：返回值一定是 Promise，同步抛出的异常会变成拒绝。
      // 测试里的假实现（async () => "回复"）大量这样写
      "@typescript-eslint/require-await": "off",
      // 取消时以 signal.reason 拒绝是标准做法（3.6 节），而 reason 的类型是 any
      "@typescript-eslint/prefer-promise-reject-errors": [
        "error",
        { allowThrowingAny: true, allowThrowingUnknown: true },
      ],
      // 第 3 章起最重要的几条规则，recommendedTypeChecked 已经包含，这里写出来是为了醒目
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      // 不在 recommended 里，但对可辨识联合非常有用（1.6 节的穷尽性检查）
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
    },
  },
  {
    // 课程示例是"标本"：很多写法是故意的（演示 any 的危害、演示什么能通过编译），
    // 不按产品代码的标准要求。异步相关的规则仍然开启：示例里故意违反的地方逐行标注了原因
    files: ["chapters/**/examples/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/only-throw-error": "off",
      "@typescript-eslint/prefer-as-const": "off",
      "no-useless-assignment": "off",
      "no-unassigned-vars": "off",
      "no-fallthrough": "off",
    },
  },
  {
    // 章末项目的演示程序导入的是学习者的练习文件，没做完时那里还是 any 占位
    files: ["chapters/**/project/demo.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
);
