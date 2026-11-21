import { describe, expect, test } from "vitest";
import {
  contentToText,
  extractText,
  hasToolError,
  isTextPart,
  partToText,
  type ContentPart,
} from "./05-content-parts.ts";

const text: ContentPart = { type: "text", text: "我查到了结果：" };
const image: ContentPart = { type: "image", url: "https://example.com/chart.png", alt: "趋势图" };
const imageNoAlt: ContentPart = { type: "image", url: "https://example.com/a.png" };
const ok: ContentPart = { type: "tool_result", toolCallId: "call_1", output: "42" };
const failed: ContentPart = {
  type: "tool_result",
  toolCallId: "call_2",
  output: "timeout",
  isError: true,
};

describe("partToText", () => {
  test("文本块返回原文", () => {
    expect(partToText(text)).toBe("我查到了结果：");
  });

  test("图片块优先使用 alt", () => {
    expect(partToText(image)).toBe("[图片: 趋势图]");
  });

  test("没有 alt 时使用 url", () => {
    expect(partToText(imageNoAlt)).toBe("[图片: https://example.com/a.png]");
  });

  test("alt 为空或只有空白时也使用 url", () => {
    expect(partToText({ type: "image", url: "u", alt: "" })).toBe("[图片: u]");
    expect(partToText({ type: "image", url: "u", alt: "  " })).toBe("[图片: u]");
  });

  test("工具结果", () => {
    expect(partToText(ok)).toBe("[工具结果 #call_1] 42");
  });

  test("失败的工具结果", () => {
    expect(partToText(failed)).toBe("[工具错误 #call_2] timeout");
  });

  test("isError 为 false 时和没有 isError 一样", () => {
    expect(partToText({ ...ok, isError: false })).toBe("[工具结果 #call_1] 42");
  });
});

describe("contentToText", () => {
  test("字符串原样返回", () => {
    expect(contentToText("你好")).toBe("你好");
  });

  test("数组中的每个块转换后用换行连接", () => {
    expect(contentToText([text, ok, image])).toBe(
      "我查到了结果：\n[工具结果 #call_1] 42\n[图片: 趋势图]",
    );
  });

  test("空数组得到空字符串", () => {
    expect(contentToText([])).toBe("");
  });

  test("undefined 得到空字符串", () => {
    expect(contentToText(undefined)).toBe("");
  });

  test("空字符串原样返回", () => {
    expect(contentToText("")).toBe("");
  });
});

describe("isTextPart", () => {
  test("只有文本块返回 true", () => {
    expect(isTextPart(text)).toBe(true);
    expect(isTextPart(image)).toBe(false);
    expect(isTextPart(ok)).toBe(false);
  });

  test("可以作为 filter 的类型守卫", () => {
    const texts = [text, image, { type: "text", text: "完毕" } as const].filter(isTextPart);
    // 如果 isTextPart 的返回类型写对了，这里可以直接访问 .text
    expect(texts.map((part) => part.text)).toEqual(["我查到了结果：", "完毕"]);
  });
});

describe("extractText", () => {
  test("字符串原样返回", () => {
    expect(extractText("hi")).toBe("hi");
  });

  test("只保留文本块", () => {
    expect(extractText([text, image, ok, { type: "text", text: "答案是 42。" }])).toBe(
      "我查到了结果：\n答案是 42。",
    );
  });

  test("没有文本块时返回空字符串", () => {
    expect(extractText([image, ok])).toBe("");
  });
});

describe("hasToolError", () => {
  test("包含失败的工具结果", () => {
    expect(hasToolError([text, ok, failed])).toBe(true);
  });

  test("工具结果都成功", () => {
    expect(hasToolError([text, ok, { ...ok, isError: false }])).toBe(false);
  });

  test("字符串内容一律为 false", () => {
    expect(hasToolError("[工具错误 #x] 假的")).toBe(false);
  });

  test("空数组为 false", () => {
    expect(hasToolError([])).toBe(false);
  });
});
