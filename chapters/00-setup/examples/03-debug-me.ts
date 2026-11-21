// 运行：pnpm tsx chapters/00-setup/examples/03-debug-me.ts
//
// 这是 0.4 节的调试练习场。程序本身是对的，用它来熟悉调试器：
//   1. 在 summarize() 里 `const chars = ...` 那一行左侧点一下，打一个断点（出现红点）
//   2. 按 F5，选择"调试当前文件（Node 原生运行 TS）"
//   3. 程序会停在断点处。观察左侧 VARIABLES 面板里的 turn、totals
//   4. 按 F10（单步跳过）逐行执行，看 totals 怎样变化
//   5. 在 WATCH 面板添加表达式 `turn.text.length`，再继续按 F5 跑到下一次循环

interface Turn {
  role: "user" | "assistant";
  text: string;
}

const conversation: Turn[] = [
  { role: "user", text: "帮我查一下 TypeScript 7 有什么新东西" },
  { role: "assistant", text: "TypeScript 7 用 Go 重写了编译器，速度快了大约 10 倍。" },
  { role: "user", text: "那我的旧项目要改什么？" },
  { role: "assistant", text: "主要是检查 tsconfig：types 默认变成了空数组。" },
];

function summarize(turns: Turn[]) {
  const totals = { user: 0, assistant: 0 };
  for (const turn of turns) {
    // [...str] 按 Unicode 码点拆分字符串。直接用 str.length 数的是 UTF-16 编码单元，
    // 对中文没区别，但像 "😀" 这样的字符会被算成 2。
    const chars = [...turn.text].length;
    totals[turn.role] += chars;
  }
  return totals;
}

const totals = summarize(conversation);
console.log("每个角色说了多少字符：", totals);
