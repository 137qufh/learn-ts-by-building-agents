// 6.7 钩子与中间件
// 运行：pnpm tsx chapters/06-harness/examples/07-middleware.ts

type Next<A, R> = (input: A) => Promise<R>;
type Wrapper<A, R> = (input: A, next: Next<A, R>) => Promise<R>;

function compose<A, R>(wrappers: readonly Wrapper<A, R>[], handler: Next<A, R>): Next<A, R> {
  return (input) => {
    const dispatch = (index: number, value: A): Promise<R> => {
      const wrapper = wrappers[index];
      if (wrapper === undefined) return Promise.try(() => handler(value));
      let called = false;
      return Promise.try(() =>
        wrapper(value, (nextValue) => {
          if (called) return Promise.reject(new Error("next() 被调用了多次"));
          called = true;
          return dispatch(index + 1, nextValue);
        }),
      );
    };
    return dispatch(0, input);
  };
}

type Call = { name: string; args: Record<string, string> };
type Outcome = { ok: boolean; content: string };

// ── 1. 真正干活的函数 ────────────────────────────────────────────────
const execute: Next<Call, Outcome> = async (call) => {
  console.log(`      执行 ${call.name}(${JSON.stringify(call.args)})`);
  return { ok: true, content: `联系人：张三，电话 13812345678` };
};

// ── 2. 几个中间件 ────────────────────────────────────────────────────
const logging: Wrapper<Call, Outcome> = async (call, next) => {
  console.log(`→ logging：进去 ${call.name}`);
  const outcome = await next(call);
  console.log(`← logging：出来 ok=${outcome.ok}`);
  return outcome;
};

const approval: Wrapper<Call, Outcome> = async (call, next) => {
  console.log(`  → approval：检查 ${call.name}`);
  if (call.name === "delete_file") {
    console.log("  ← approval：拒绝，不调用 next，里面的都不执行");
    return { ok: false, content: `用户拒绝了这次 ${call.name} 调用。不要重试同样的操作。` };
  }
  return next(call);
};

const masking: Wrapper<Call, Outcome> = async (call, next) => {
  const outcome = await next(call);
  console.log("    ← masking：结果里的手机号打码");
  return {
    ...outcome,
    content: outcome.content.replaceAll(
      /1\d{10}/g,
      (phone) => `${phone.slice(0, 3)}****${phone.slice(-4)}`,
    ),
  };
};

const run = compose([logging, approval, masking], execute);

console.log(await run({ name: "lookup", args: { name: "张三" } }));
// → logging：进去 lookup
//   → approval：检查 lookup
//       执行 lookup({"name":"张三"})
//     ← masking：结果里的手机号打码
// ← logging：出来 ok=true
// { ok: true, content: '联系人：张三，电话 138****5678' }

console.log();
console.log(await run({ name: "delete_file", args: { path: "a.ts" } }));
// → logging：进去 delete_file
//   → approval：检查 delete_file
//   ← approval：拒绝，不调用 next，里面的都不执行
// ← logging：出来 ok=false
// { ok: false, content: '用户拒绝了这次 delete_file 调用。不要重试同样的操作。' }

// ── 3. 调用两次 next：工具会被执行两次，所以直接拒绝 ──────────────────
const buggyRetry: Wrapper<Call, Outcome> = async (call, next) => {
  try {
    return await next(call);
  } finally {
    await next(call); // 想"失败时重试"，却写成了每次都再调用一次
  }
};
try {
  await compose([buggyRetry], execute)({ name: "write_file", args: { path: "a.ts" } });
} catch (error) {
  console.log(`\n${(error as Error).message}`);
}
//       执行 write_file({"path":"a.ts"})   ← 第一次 next 正常执行了
//
// next() 被调用了多次                      ← 第二次被拒绝，文件不会被写两次
