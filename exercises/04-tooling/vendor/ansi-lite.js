// ansi-lite：给终端文字加颜色的小库。纯 JavaScript，没有类型声明。
// 练习 4-4 要求你为它写出 ansi-lite.d.ts。不要修改这个文件。

const ESC = "\u001b[";

const STYLES = {
  bold: [1, 22],
  dim: [2, 22],
  italic: [3, 23],
  underline: [4, 24],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  blue: [34, 39],
  gray: [90, 39],
};

let enabled = true;

/** 当前是否输出颜色 */
export function isEnabled() {
  return enabled;
}

/** 关掉颜色（比如输出被重定向到文件时），之后所有函数都原样返回文字 */
export function setEnabled(value) {
  enabled = value;
}

/** 依次套上若干样式。未知的样式名抛出 TypeError */
export function style(text, ...names) {
  let out = text;
  for (const name of names) {
    const codes = STYLES[name];
    if (codes === undefined) {
      throw new TypeError(`未知的样式：${name}`);
    }
    if (enabled) {
      out = `${ESC}${codes[0]}m${out}${ESC}${codes[1]}m`;
    }
  }
  return out;
}

export const bold = (text) => style(text, "bold");
export const red = (text) => style(text, "red");
export const green = (text) => style(text, "green");
export const yellow = (text) => style(text, "yellow");
export const gray = (text) => style(text, "gray");

/** 去掉文字里的所有颜色代码 */
export function strip(text) {
  // eslint-disable-next-line no-control-regex -- 颜色代码就是以控制字符 ESC 开头的
  return text.replace(/\u001b\[\d+m/g, "");
}

/** 所有样式名 */
export const styleNames = Object.freeze(Object.keys(STYLES));

export const VERSION = "1.4.2";

export default { style, strip, bold, red, green, yellow, gray, isEnabled, setEnabled };
