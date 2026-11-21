// 第 0 章项目：Echo Agent 的命令行入口
//
// 运行：pnpm tsx chapters/00-setup/project/cli.ts
//
// 它调用的是你在 exercises/00-setup/project/echo-agent.ts 里写的 reply()。
// 这个文件用到了 async/await 和 for await，第 3 章才会讲，现在看不懂没关系：
// 你只需要知道它在循环做三件事：读一行输入 → 交给 reply() → 打印回复。

import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { reply, shouldExit } from "../../../exercises/00-setup/project/echo-agent.ts";

const rl = createInterface({ input: stdin, output: stdout });

console.log("Echo Agent 已启动。输入 /help 查看命令，/exit 退出。");
rl.setPrompt("you> ");
rl.prompt();

// "agent 循环"的雏形：等待输入 → 决定回应 → 输出 → 继续等待
for await (const line of rl) {
  try {
    if (shouldExit(line)) {
      break;
    }
    console.log(`agent> ${reply(line)}`);
  } catch (error) {
    // 练习还没完成时，todo() 会抛出错误。我们把它打印出来，而不是让程序崩溃。
    const message = error instanceof Error ? error.message : String(error);
    console.log(`agent> （出错了：${message}）`);
  }
  rl.prompt();
}

rl.close();
console.log("再见！");
