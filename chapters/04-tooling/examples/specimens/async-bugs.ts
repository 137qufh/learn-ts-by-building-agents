// 4.5 节示例要检查的"标本"：能通过 tsc，但每个函数都有 bug。
// 这个目录在 eslint.config.ts 里被忽略了（否则 pnpm lint 会报错），由 05-linting.ts 显式检查。

interface Store {
  save(text: string): Promise<void>;
}

export async function saveAll(store: Store, items: string[]): Promise<void> {
  items.forEach(async (item) => {
    await store.save(item);
  });
}

export function log(store: Store, value: { id: number }): void {
  store.save(`保存了 ${value}`);
}

export async function twice(n: number): Promise<number> {
  return (await n) * 2;
}
