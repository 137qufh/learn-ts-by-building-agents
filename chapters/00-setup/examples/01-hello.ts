// 运行：pnpm tsx chapters/00-setup/examples/01-hello.ts
//   或：node chapters/00-setup/examples/01-hello.ts

// `name: string` 是类型标注：参数 name 必须是字符串。
// `): string` 标注返回值也是字符串。
function greet(name: string): string {
  // 反引号是 JavaScript 的模板字符串，${...} 里可以放任意表达式
  return `Hello, ${name}!`;
}

const names = ["Ada", "Linus", "Grace"];

for (const name of names) {
  console.log(greet(name));
}
// Hello, Ada!
// Hello, Linus!
// Hello, Grace!

// 下面这行在编辑器里会标红：42 不是 string。
// `@ts-expect-error` 告诉 tsc "我知道这行有类型错误，是故意的"。
// 但注意：程序照样会运行并打印 "Hello, 42!"。为什么？见 0.2 节。
// @ts-expect-error -- Argument of type 'number' is not assignable to parameter of type 'string'.
console.log(greet(42));
