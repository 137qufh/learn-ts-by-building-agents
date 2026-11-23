// 7.8 一个用例失败，后面的还要跑
// 运行：node chapters/07-extensions/examples/08-evals.ts
//
// 预期输出：
// 坏了 运行抛出了错误：超时
// 好的 tools add,search
// passed 1

interface Outcome {
  text: string;
  tools: string[];
}

const cases: { name: string; run: () => Outcome; includes: string }[] = [
  {
    name: "坏了",
    run: () => {
      throw new Error("超时");
    },
    includes: "没有",
  },
  { name: "好的", run: () => ({ text: "买了牛奶", tools: ["add", "search"] }), includes: "牛奶" },
];

let passed = 0;
for (const item of cases) {
  try {
    const outcome = item.run();
    if (outcome.text.includes(item.includes)) {
      passed += 1;
      console.log(item.name, "tools", outcome.tools.join(","));
    } else {
      console.log(item.name, "文本没有包含", item.includes);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(item.name, `运行抛出了错误：${message}`);
  }
}
console.log("passed", passed);
