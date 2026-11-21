/**
 * 练习 1-2：模型 ID 与消息列表 —— 参考答案
 */

/** 模型 ID 拆分后的结果：[供应商, 模型名]。 */
export type ModelId = readonly [provider: string, model: string];

/** 把形如 "anthropic/claude-sonnet" 的字符串拆成 [供应商, 模型名]。 */
export function splitModelId(id: string): ModelId {
  // 为什么不用 trimmed.split("/")？
  // split 会按 **所有** "/" 拆分，"openrouter/meta/llama" 会变成三段，还得再拼回去；
  // 而且开启 noUncheckedIndexedAccess 后，parts[0]、parts[1] 的类型都带 undefined，
  // 要多写不少检查。indexOf + slice 直接表达了"按第一个 / 拆成两半"的意图。
  const trimmed = id.trim();
  const slash = trimmed.indexOf("/");

  // 没有 "/"：indexOf 返回 -1
  const provider = slash === -1 ? "unknown" : trimmed.slice(0, slash);
  const model = slash === -1 ? trimmed : trimmed.slice(slash + 1);

  if (provider === "" || model === "") {
    throw new Error(`无效的模型 ID："${id}"`);
  }
  return [provider, model];
}

/** splitModelId 的逆操作。 */
export function formatModelId([provider, model]: ModelId): string {
  return provider === "unknown" ? model : `${provider}/${model}`;
}

/** 返回最后 n 条消息组成的新数组（不修改原数组）。 */
export function lastN(messages: readonly string[], n: number): string[] {
  // 陷阱：messages.slice(-0) 等于 messages.slice(0)，会返回 **全部** 消息，
  // 所以 n <= 0 必须单独处理。
  if (n <= 0) {
    return [];
  }
  // slice 总是返回新数组；起点为负数时从末尾倒数，超出范围会被自动截断到 0。
  return messages.slice(-n);
}

/** 返回最后一条去掉首尾空白后不为空的消息；找不到时返回 undefined。 */
export function lastNonEmpty(messages: readonly string[]): string | undefined {
  // findLast 从后往前找（ES2023）。也可以用倒序的 for 循环，
  // 但那样要按下标访问，元素类型会带上 undefined。
  return messages.findLast((message) => message.trim() !== "");
}
