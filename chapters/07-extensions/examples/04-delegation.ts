// 7.4 子 agent 看不到父对话
// 运行：node chapters/07-extensions/examples/04-delegation.ts
//
// 预期输出：
// child system,user
// 背景：
// 买牛奶
//
// 任务：
// 总结购物
// summary 两瓶
// parent messages stayed 3

const parent = ["系统里的密钥 sk-secret", "用户：帮我买东西", "工具结果：货架上有低脂"];

function taskForChild(task: string, context: string | undefined): string {
  return context === undefined ? task : `背景：\n${context}\n\n任务：\n${task}`;
}

const sent = ["用一句话总结", taskForChild("总结购物", "买牛奶")];
console.log("child", "system,user");
console.log(sent[1]);
const leaked = sent.some((line) => line?.includes("sk-secret"));
console.log("summary", leaked ? "泄漏了" : "两瓶");
console.log("parent messages stayed", parent.length);
