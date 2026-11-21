/**
 * 仓库自检：Markdown 里的相对链接都必须指向真实存在的文件。
 * 课程文件之间互相引用很多，改名或移动文件时很容易留下死链。
 */
import { existsSync, globSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const markdownFiles = globSync("**/*.md", { exclude: ["node_modules/**"] }).sort();

// 匹配 [文字](目标)，忽略图片前的 ! 也没关系：图片同样应该存在
const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

describe("Markdown 相对链接", () => {
  test.each(markdownFiles)("%s", (file) => {
    // 去掉代码块，代码示例里的方括号不是链接
    const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
    const broken: string[] = [];
    for (const [, target = ""] of text.matchAll(LINK)) {
      if (/^[a-z]+:/i.test(target) || target.startsWith("#")) continue; // 外链和页内锚点
      const path = decodeURIComponent(target.split("#")[0] ?? "");
      if (!existsSync(resolve(dirname(file), path))) broken.push(target);
    }
    expect(broken, `${file} 中有失效链接`).toEqual([]);
  });
});
