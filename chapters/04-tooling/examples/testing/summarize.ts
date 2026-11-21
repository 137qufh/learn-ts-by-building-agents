// 4.6 节示例：一个要被测试的函数。它的依赖（模型、缓存、时钟、等待）全部从参数传入。

export interface Llm {
  complete(prompt: string): Promise<string>;
}

export interface Cache {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

export interface SummarizeDeps {
  llm: Llm;
  cache: Cache;
  /** 当前时间（毫秒），默认 Date.now */
  now?: () => number;
  /** 等待 ms 毫秒，默认用 setTimeout */
  sleep?: (ms: number) => Promise<void>;
}

export interface Summary {
  text: string;
  cached: boolean;
  ms: number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 总结一段文字：先查缓存；调用模型失败时等 1 秒重试一次 */
export async function summarize(input: string, deps: SummarizeDeps): Promise<Summary> {
  const { llm, cache, now = Date.now, sleep = defaultSleep } = deps;
  const started = now();
  const key = `summary:${input}`;

  const hit = await cache.get(key);
  if (hit !== undefined) {
    return { text: hit, cached: true, ms: now() - started };
  }

  const prompt = `用一句话总结：${input}`;
  let text: string;
  try {
    text = await llm.complete(prompt);
  } catch {
    await sleep(1000);
    text = await llm.complete(prompt);
  }
  await cache.set(key, text);
  return { text, cached: false, ms: now() - started };
}
