/**
 * 练习 3-8 参考答案：处理异步流的工具
 */

export async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of source) {
    items.push(item);
  }
  return items;
}

export async function* take<T>(source: AsyncIterable<T>, count: number): AsyncGenerator<T> {
  if (count <= 0) {
    return; // 在 for await 之前返回：上游的迭代器根本不会被创建
  }
  let taken = 0;
  for await (const item of source) {
    yield item;
    taken++;
    if (taken >= count) {
      return; // 退出 for await，它会调用上游的 return()，上游的 finally 得以执行
    }
  }
}

export async function* mapAsync<T, R>(
  source: AsyncIterable<T>,
  fn: (item: T, index: number) => R | Promise<R>,
): AsyncGenerator<R> {
  let index = 0;
  for await (const item of source) {
    yield await fn(item, index++);
  }
}

export async function* batch<T>(source: AsyncIterable<T>, size: number): AsyncGenerator<T[]> {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`size 必须是大于等于 1 的整数，收到 ${size}`);
  }
  let current: T[] = [];
  for await (const item of source) {
    current.push(item);
    if (current.length === size) {
      yield current;
      current = []; // 新建数组，而不是清空：已经交出去的数组不能再被修改
    }
  }
  if (current.length > 0) {
    yield current;
  }
}

const TIMED_OUT = Symbol("timed out");

export async function* idleTimeout<T>(source: AsyncIterable<T>, ms: number): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]();
  // 上游已经自己结束了（done: true 或者抛出了异常），就不需要再调用 return()
  let upstreamFinished = false;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      // 定时器兑现为一个特殊的值，而不是拒绝：这样上游抛出的异常和我们的超时不会混在一起
      const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms);
      });
      let result: IteratorResult<T> | typeof TIMED_OUT;
      try {
        result = await Promise.race([iterator.next(), timeout]);
      } catch (error) {
        upstreamFinished = true; // 上游抛出异常，它已经结束了
        throw error;
      } finally {
        clearTimeout(timer);
      }
      if (result === TIMED_OUT) {
        throw new DOMException(`超过 ${ms}ms 没有收到新数据`, "TimeoutError");
      }
      if (result.done) {
        upstreamFinished = true;
        return;
      }
      // yield 期间（消费者在执行循环体）没有定时器在跑，所以消费者花的时间不算
      yield result.value;
    }
  } finally {
    if (!upstreamFinished) {
      // 超时或者消费者提前退出：通知上游结束。不 await（原因见题目），但要处理它可能的拒绝
      iterator.return?.()?.catch(() => {});
    }
  }
}
