// 7.5 委托继续，交接结束；密钥不进共享上下文
// 运行：node chapters/07-extensions/examples/05-orchestration.ts
//
// 预期输出：
// shared note,inputTokens
// delegate 搜索：找到 牛奶
// handoff 写作
// final 写完了

function isSecret(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");
  return ["apikey", "token", "secret", "password", "authorization", "cookie"].some((suffix) =>
    normalized.endsWith(suffix),
  );
}

const facts: Record<string, unknown> = { note: "买牛奶", apiKey: "sk-secret", inputTokens: "12" };
const allow = ["note", "apiKey", "inputTokens"];
const shared: Record<string, string> = {};
for (const key of allow) {
  const value = facts[key];
  if (isSecret(key) || typeof value !== "string") continue;
  shared[key] = value;
}
console.log("shared", Object.keys(shared).join(","));

type Decision =
  | { type: "delegate"; name: string }
  | { type: "handoff"; name: string }
  | { type: "final"; text: string };

const decisions: Decision[] = [
  { type: "delegate", name: "搜索" },
  { type: "handoff", name: "写作" },
  { type: "final", text: "不会执行到" },
];
const notes: string[] = [];
for (const decision of decisions) {
  if (decision.type === "final") {
    console.log("final", decision.text);
    break;
  }
  const reply = decision.name === "搜索" ? "找到 牛奶" : "写完了";
  if (decision.type === "handoff") {
    console.log("delegate", notes[0]);
    console.log("handoff", decision.name);
    console.log("final", reply);
    break;
  }
  notes.push(`${decision.name}：${reply}`);
}
