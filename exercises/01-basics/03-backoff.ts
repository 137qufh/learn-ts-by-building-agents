/**
 * 练习 1-3：重试退避与文本管道
 *
 * 课程：chapters/01-basics/04-functions.md
 * 运行：pnpm ex 03-backoff
 *
 * 调用模型 API 时，遇到限流（HTTP 429）或临时故障，正确的做法是等一会儿再重试，
 * 而且每次失败后等待的时间越来越长，这叫"指数退避"（exponential backoff）。
 * 第 3 章我们会真的去等待和重试，这里先实现"该等多久"的计算。
 */
import { todo } from "../todo.ts";

export interface BackoffOptions {
  /** 第 1 次重试前等待的毫秒数，默认 500 */
  baseMs?: number;
  /** 每次重试等待时间的倍数，默认 2 */
  factor?: number;
  /** 等待时间的上限（毫秒），默认 30_000 */
  maxMs?: number;
}

/**
 * 计算第 attempt 次重试前应等待的毫秒数（attempt 从 1 开始）。
 *
 *   delay = baseMs × factor^(attempt - 1)，且不超过 maxMs
 *
 * 使用默认值时：第 1 次 500，第 2 次 1000，第 3 次 2000……
 *
 * attempt 不是大于等于 1 的整数时，抛出 RangeError（JavaScript 内置的错误类型，
 * 用法和 Error 一样：`throw new RangeError("...")`）。
 *
 * 提示：`**` 是幂运算符，`2 ** 3 === 8`；Math.min 取较小值。
 */
export function backoffDelay(attempt: number, options: BackoffOptions = {}): number {
  return todo("实现 backoffDelay");
}

/** 返回第 1 到第 retries 次重试各自的等待时间。retries 为 0 时返回空数组。 */
export function backoffSchedule(retries: number, options: BackoffOptions = {}): number[] {
  return todo("实现 backoffSchedule");
}

/** 一个文本处理步骤。 */
export type Transform = (text: string) => string;

/**
 * 把多个步骤从左到右组合成一个步骤：compose(f, g)(x) 等于 g(f(x))。
 * 没有任何步骤时，返回一个原样返回输入的函数。
 */
export function compose(...steps: Transform[]): Transform {
  return todo("实现 compose");
}

/**
 * 创建一个"截断"步骤：文本长度超过 max 时，保留前 max 个字符并加上 "…"；否则原样返回。
 *
 * 这是一个"返回函数的函数"：truncateTo(5) 返回一个 Transform。
 */
export function truncateTo(max: number): Transform {
  return todo("实现 truncateTo");
}
