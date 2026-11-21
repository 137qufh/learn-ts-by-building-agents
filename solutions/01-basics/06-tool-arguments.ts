/**
 * 练习 1-6：工具参数与错误信息 —— 参考答案
 */

/** 类型守卫：value 是否是一个"普通对象"（不是 null，不是数组）。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  // 三个条件缺一不可：typeof null 和 typeof [] 都是 "object"
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 把模型给出的参数字符串解析成对象。 */
export function parseToolArguments(json: string): Record<string, unknown> {
  if (json.trim() === "") {
    return {};
  }

  // 显式标注为 unknown：JSON.parse 返回的 any 到此为止，不会扩散出去
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`工具参数不是合法的 JSON：${getErrorMessage(error)}`, { cause: error });
  }

  if (!isRecord(parsed)) {
    throw new Error("工具参数必须是 JSON 对象");
  }
  return parsed; // 守卫通过，parsed 的类型已经是 Record<string, unknown>
}

/** 读取一个字符串参数；参数不存在或不是字符串时返回 undefined。 */
export function getString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]; // unknown
  return typeof value === "string" ? value : undefined;
}

/** 读取一个必需的数字参数。 */
export function requireNumber(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  // 先用 typeof 收窄成 number，再用 Number.isFinite 排除 NaN 和 ±Infinity
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`参数 ${key} 必须是有限的数字`);
  }
  return value;
}

/** 从任意被 throw 出来的值中提取一条可读的错误信息。 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // 这里用 || 是有意的：message 为空字符串时，我们正想回退到 name
    return error.message || error.name;
  }
  if (typeof error === "string") {
    return error;
  }
  // isRecord 收窄后可以读取任意属性，读到的是 unknown，还要再检查一次
  if (isRecord(error) && typeof error["message"] === "string") {
    return error["message"];
  }
  return "未知错误";
}
