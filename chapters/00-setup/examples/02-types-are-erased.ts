// 运行：pnpm tsx chapters/00-setup/examples/02-types-are-erased.ts
//
// 演示：类型只在编译期存在。运行时的数据如果和声明的类型不符，TypeScript 帮不了你。

interface Usage {
  inputTokens: number;
  outputTokens: number;
}

function total(usage: Usage): number {
  return usage.inputTokens + usage.outputTokens;
}

// 1. 代码里直接写出来的数据：TypeScript 能完整检查
const fromCode: Usage = { inputTokens: 100, outputTokens: 20 };
console.log("fromCode:", total(fromCode)); // fromCode: 120

// 2. 运行时才拿到的数据：TypeScript 只能"相信"你的声明
//    假设这段 JSON 来自某个 API 的响应，对方把数字写成了字符串
const body = '{"inputTokens": "100", "outputTokens": 20}';
const fromNetwork: Usage = JSON.parse(body); // JSON.parse 返回 any，tsc 不会报错

console.log("fromNetwork:", total(fromNetwork)); // fromNetwork: 10020  ← 字符串拼接！
console.log("typeof inputTokens:", typeof fromNetwork.inputTokens); // typeof inputTokens: string

// 3. 类型不是值，运行时根本不存在。下面的函数从未被调用，
//    只是用来展示 tsc 的报错：你不能把一个类型当作值来使用。
function typesDoNotExistAtRuntime() {
  // @ts-expect-error -- 'Usage' only refers to a type, but is being used as a value here.
  return Usage;
}
void typesDoNotExistAtRuntime;
