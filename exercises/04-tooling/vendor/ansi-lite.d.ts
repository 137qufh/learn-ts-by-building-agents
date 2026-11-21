// 练习 4-4 第一部分：ansi-lite.js 的类型声明
//
// 对照 ansi-lite.js，为它的每一个导出写出类型。要求：
// - StyleName：所有样式名组成的字面量联合类型
// - style 只接受合法的样式名：style("hi", "purple") 应该是类型错误
// - styleNames 是只读的样式名数组
// - 默认导出是一个对象，包含 style、strip、bold、red、green、yellow、gray、isEnabled、setEnabled
//
// 提示：声明文件里只写类型，不写实现。函数用 `export declare function`，常量用 `export declare const`。
// 下面每个 Todo 和 Untyped 都要换掉；做完之后，import 和 Untyped 就用不上了，可以删掉。

import type { Todo } from "../../todo.ts";

/**
 * 占位用的"什么都接受"的函数类型。用它而不是 Todo，是为了让调用这些函数的代码
 * （04-colors.ts 和它的测试）在你写完之前也能通过 `pnpm typecheck`。
 * 类型测试会发现它不是准确的签名。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Untyped = (...args: any[]) => any;

export type StyleName = Todo;

export declare const isEnabled: Untyped;
export declare const setEnabled: Untyped;
export declare const style: Untyped;
export declare const bold: Untyped;
export declare const red: Untyped;
export declare const green: Untyped;
export declare const yellow: Untyped;
export declare const gray: Untyped;
export declare const strip: Untyped;
export declare const styleNames: Todo;
export declare const VERSION: Todo;

declare const ansi: Todo;
export default ansi;
