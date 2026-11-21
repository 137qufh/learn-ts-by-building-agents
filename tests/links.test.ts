/**
 * 仓库自检：Markdown 里的相对链接都必须指向真实存在的文件；带 #锚点 的链接，锚点也必须存在。
 * 课程文件之间互相引用很多，改名、移动文件或修改标题时很容易留下死链。
 */
import { existsSync, globSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const markdownFiles = globSync("**/*.md", { exclude: ["node_modules/**"] }).sort();

// 匹配 [文字](目标)
const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

/** 去掉代码块：代码示例里的方括号不是链接，# 开头的行也不是标题。 */
function stripCodeBlocks(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, "");
}

/** 近似 GitHub 生成标题锚点的规则：小写、去掉标点、空格变成连字符。 */
function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function anchorsOf(file: string): Set<string> {
  const anchors = new Set<string>();
  for (const [, heading = ""] of stripCodeBlocks(readFileSync(file, "utf8")).matchAll(
    /^#{1,6}\s+(.+)$/gm,
  )) {
    anchors.add(slugify(heading));
  }
  return anchors;
}

describe("Markdown 相对链接", () => {
  test.each(markdownFiles)("%s", (file) => {
    const text = stripCodeBlocks(readFileSync(file, "utf8"));
    const broken: string[] = [];
    for (const [, target = ""] of text.matchAll(LINK)) {
      if (/^[a-z]+:/i.test(target)) continue; // 外部链接
      const [rawPath = "", anchor] = target.split("#");
      const path = rawPath === "" ? file : resolve(dirname(file), decodeURIComponent(rawPath));
      if (!existsSync(path)) {
        broken.push(target);
      } else if (anchor !== undefined && path.endsWith(".md")) {
        if (!anchorsOf(path).has(decodeURIComponent(anchor))) broken.push(target);
      }
    }
    expect(broken, `${file} 中有失效链接`).toEqual([]);
  });
});
