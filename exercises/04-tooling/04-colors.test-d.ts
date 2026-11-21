import { expectTypeOf, test } from "vitest";
import ansi, {
  bold,
  gray,
  green,
  isEnabled,
  red,
  setEnabled,
  strip,
  style,
  styleNames,
  VERSION,
  yellow,
  type StyleName,
} from "./vendor/ansi-lite.js";

test("StyleName 是所有样式名的联合", () => {
  expectTypeOf<StyleName>().toEqualTypeOf<
    "bold" | "dim" | "italic" | "underline" | "red" | "green" | "yellow" | "blue" | "gray"
  >();
});

test("函数的签名", () => {
  expectTypeOf(style).toEqualTypeOf<(text: string, ...names: StyleName[]) => string>();
  expectTypeOf(strip).toEqualTypeOf<(text: string) => string>();
  for (const color of [bold, red, green, yellow, gray]) {
    expectTypeOf(color).toEqualTypeOf<(text: string) => string>();
  }
  expectTypeOf(isEnabled).toEqualTypeOf<() => boolean>();
  expectTypeOf(setEnabled).toEqualTypeOf<(value: boolean) => void>();
});

test("style 只接受合法的样式名", () => {
  style("hi", "bold", "red");
  style("hi");
  // @ts-expect-error 没有 purple 这个样式
  style("hi", "purple");
  // @ts-expect-error 文字必须是字符串
  style(42, "red");
});

test("常量", () => {
  expectTypeOf(styleNames).toEqualTypeOf<readonly StyleName[]>();
  expectTypeOf(VERSION).toEqualTypeOf<string>();
});

test("默认导出", () => {
  expectTypeOf(ansi.style).toEqualTypeOf(style);
  expectTypeOf(ansi).toHaveProperty("setEnabled");
  expectTypeOf(ansi).toHaveProperty("isEnabled");
  expectTypeOf<keyof typeof ansi>().toEqualTypeOf<
    "style" | "strip" | "bold" | "red" | "green" | "yellow" | "gray" | "isEnabled" | "setEnabled"
  >();
});
