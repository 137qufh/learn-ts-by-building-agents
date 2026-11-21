/**
 * 练习 3-5 参考答案：批量执行
 */

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit 必须是大于等于 1 的整数，收到 ${limit}`);
  }
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  assertLimit(limit);
  const results: R[] = new Array(items.length);
  let next = 0;
  let failed = false;

  async function worker(): Promise<void> {
    // 每次领取前检查 failed：一旦有任务失败，所有工作者都不再领取新任务
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index] as T, index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export interface Limiter {
  run<T>(task: () => Promise<T>): Promise<T>;
  readonly active: number;
  readonly pending: number;
}

export function createLimiter(limit: number): Limiter {
  assertLimit(limit);
  let active = 0;
  // 等待队列里放的是"轮到你了"时要调用的函数
  const queue: (() => void)[] = [];

  function release(): void {
    const next = queue.shift();
    if (next !== undefined) {
      // 把名额直接"交接"给排在最前面的任务，active 不变。
      // 如果先 active-- 再唤醒它，在它真正恢复执行之前（那是一个之后才执行的微任务），
      // 新提交的任务会看到空出来的名额并抢走它，等它恢复后 active 就超过了 limit。
      next();
    } else {
      active--;
    }
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (active < limit) {
        active++;
      } else {
        // 名额已满：在这里等，直到某个任务完成后把名额交接给我们
        await new Promise<void>((resolve) => queue.push(resolve));
      }
      try {
        // 必须 await：保证 finally 在任务完成之后才执行（3.3 节的 return await）。
        // 任务同步抛出时，异常发生在 try 里面，同样会走到 finally。
        return await task();
      } finally {
        release();
      }
    },
    get active() {
      return active;
    },
    get pending() {
      return queue.length;
    },
  };
}

// 2.3 节的同态映射类型 + 2.5 节提到的 Awaited
export type AwaitedObject<T> = { [K in keyof T]: Awaited<T[K]> };

export async function allObject<T extends Record<string, unknown>>(
  record: T,
): Promise<AwaitedObject<T>> {
  const keys = Object.keys(record);
  const values = await Promise.all(keys.map((key) => record[key]));
  // Object.fromEntries 返回 { [k: string]: unknown }，TS 无法知道它和 AwaitedObject<T> 的关系，需要断言。
  // 这里是安全的：键来自 record 本身，值是对应的 await 结果。
  return Object.fromEntries(keys.map((key, i) => [key, values[i]])) as AwaitedObject<T>;
}
