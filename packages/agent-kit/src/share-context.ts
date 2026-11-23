/**
 * 决定哪些事实可以交给另一个 agent（第 7 章）。
 *
 * 允许名单决定"能传什么"，isSecretKey 决定"即使被允许也不能传"。
 * 第 6 章已经把"apiKey 是密钥、inputTokens 不是"写对了，这里直接复用，不再发明一条包含 token 的正则。
 */
import { isSecretKey } from "./agent/tracing.ts";

export interface SharePolicy {
  /** 可以传的键，大小写敏感，结果里的顺序跟这个名单一致。 */
  allow: readonly string[];
  /** 额外禁止的键，大小写不敏感。密钥键名即使出现在 allow 里也会被丢掉。 */
  deny?: readonly string[];
}

export function shareContext(
  facts: Readonly<Record<string, unknown>>,
  policy: SharePolicy,
): Record<string, string> {
  const denied = new Set((policy.deny ?? []).map((key) => key.toLowerCase()));
  const result: Record<string, string> = {};
  const seen = new Set<string>();
  for (const key of policy.allow) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (isSecretKey(key) || denied.has(key.toLowerCase())) continue;
    const value = facts[key];
    // 不把数字、对象悄悄变成字符串：事实的类型是调用方的承诺，不合约定就当没这条。
    if (typeof value !== "string") continue;
    result[key] = value;
  }
  return result;
}
