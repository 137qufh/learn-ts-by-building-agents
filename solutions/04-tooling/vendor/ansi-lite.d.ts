// 练习 4-4 第一部分：ansi-lite.js 的类型声明
//
// 对照 ansi-lite.js，为它的每一个导出写出类型。要求：
// - StyleName：所有样式名组成的字面量联合类型
// - style 只接受合法的样式名：style("hi", "purple") 应该是类型错误
// - styleNames 是只读的样式名数组
// - 默认导出是一个对象，包含 style、strip、bold、red、green、yellow、gray、isEnabled、setEnabled
//
// 提示：声明文件里只写类型，不写实现。函数用 `export declare function`，常量用 `export declare const`。

export type StyleName =
  "bold" | "dim" | "italic" | "underline" | "red" | "green" | "yellow" | "blue" | "gray";

/** 当前是否输出颜色 */
export declare function isEnabled(): boolean;

/** 关掉颜色（比如输出被重定向到文件时），之后所有函数都原样返回文字 */
export declare function setEnabled(value: boolean): void;

/** 依次套上若干样式。未知的样式名抛出 TypeError */
export declare function style(text: string, ...names: StyleName[]): string;

export declare function bold(text: string): string;
export declare function red(text: string): string;
export declare function green(text: string): string;
export declare function yellow(text: string): string;
export declare function gray(text: string): string;

/** 去掉文字里的所有颜色代码 */
export declare function strip(text: string): string;

/** 所有样式名 */
export declare const styleNames: readonly StyleName[];

export declare const VERSION: string;

declare const ansi: {
  style: typeof style;
  strip: typeof strip;
  bold: typeof bold;
  red: typeof red;
  green: typeof green;
  yellow: typeof yellow;
  gray: typeof gray;
  isEnabled: typeof isEnabled;
  setEnabled: typeof setEnabled;
};
export default ansi;
