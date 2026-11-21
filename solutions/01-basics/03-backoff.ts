/**
 * 练习 1-3：重试退避与文本管道 —— 参考答案
 */

export interface BackoffOptions {
  /** 第 1 次重试前等待的毫秒数，默认 500 */
  baseMs?: number;
  /** 每次重试等待时间的倍数，默认 2 */
  factor?: number;
  /** 等待时间的上限（毫秒），默认 30_000 */
  maxMs?: number;
}

/** 计算第 attempt 次重试前应等待的毫秒数（attempt 从 1 开始）。 */
export function backoffDelay(attempt: number, options: BackoffOptions = {}): number {
  // Number.isInteger(NaN) 是 false，所以 NaN 也会在这里被拦下
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new RangeError(`attempt 必须是大于等于 1 的整数，收到的是 ${attempt}`);
  }
  // 解构 + 默认值：只有属性为 undefined 时才使用默认值，所以 baseMs: 0 会被保留
  const { baseMs = 500, factor = 2, maxMs = 30_000 } = options;
  return Math.min(baseMs * factor ** (attempt - 1), maxMs);
}

/** 返回第 1 到第 retries 次重试各自的等待时间。 */
export function backoffSchedule(retries: number, options: BackoffOptions = {}): number[] {
  // 也可以写成一行：Array.from({ length: retries }, (_, i) => backoffDelay(i + 1, options))
  const delays: number[] = []; // 空数组要标注类型
  for (let attempt = 1; attempt <= retries; attempt++) {
    delays.push(backoffDelay(attempt, options));
  }
  return delays;
}

/** 一个文本处理步骤。 */
export type Transform = (text: string) => string;

/** 把多个步骤从左到右组合成一个步骤。 */
export function compose(...steps: Transform[]): Transform {
  // 返回一个新函数；steps 被闭包"记住"，直到真正调用时才依次执行。
  // 熟悉函数式写法的话，也可以用 reduce：
  //   return (text) => steps.reduce((acc, step) => step(acc), text);
  return (text) => {
    let result = text;
    for (const step of steps) {
      result = step(result);
    }
    return result;
  };
}

/** 创建一个"截断"步骤。 */
export function truncateTo(max: number): Transform {
  return (text) => (text.length > max ? `${text.slice(0, max)}…` : text);
}
