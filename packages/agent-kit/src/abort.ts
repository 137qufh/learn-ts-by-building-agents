/**
 * 取消与超时（来自练习 3-6）
 */

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) {
    return promise;
  }
  if (signal.aborted) {
    // promise 照样在运行，它之后的拒绝没人处理会变成"未处理的拒绝"。挂一个空的 catch 表明我们有意忽略它
    promise.catch(() => {});
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    // then 的两个回调都会先移除监听，再转交结果。
    // 被放弃之后 promise 才拒绝也没关系：这里已经处理了它，不会产生未处理的拒绝
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  ms: number,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const signals = [AbortSignal.timeout(ms)];
  if (options.signal) {
    signals.push(options.signal);
  }
  const signal = AbortSignal.any(signals);
  // task 可能同步抛出：用 Promise.try 把它统一成被拒绝的 Promise
  return raceAbort(
    Promise.try(() => task(signal)),
    signal,
  );
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}
