import { describe, expect, test } from "vitest";
import { HELP_TEXT, reply, shouldExit } from "./echo-agent.ts";

describe("reply", () => {
  describe("普通文本", () => {
    test("原样复读", () => {
      expect(reply("hi")).toBe("你说：hi");
    });

    test("去掉首尾空白后再复读", () => {
      expect(reply("  今天天气不错 \n")).toBe("你说：今天天气不错");
    });

    test("空输入", () => {
      expect(reply("")).toBe("（你什么都没说）");
      expect(reply("   ")).toBe("（你什么都没说）");
    });
  });

  describe("命令", () => {
    test("/help 返回帮助文本", () => {
      expect(reply("/help")).toBe(HELP_TEXT);
      expect(reply("  /help  ")).toBe(HELP_TEXT);
    });

    test("/upper 转大写", () => {
      expect(reply("/upper hello agent")).toBe("HELLO AGENT");
    });

    test("/reverse 倒序", () => {
      expect(reply("/reverse abc")).toBe("cba");
    });

    test("/reverse 能正确处理中文", () => {
      expect(reply("/reverse 你好世界")).toBe("界世好你");
    });

    test("/count 统计词数", () => {
      expect(reply("/count one two  three")).toBe("3 个词");
      expect(reply("/count single")).toBe("1 个词");
    });

    test("命令和参数之间可以有多个空白，参数首尾空白会被去掉", () => {
      expect(reply("/upper    hi there  ")).toBe("HI THERE");
    });

    test("缺少参数时提示用法", () => {
      expect(reply("/upper")).toBe("用法：/upper <文本>");
      expect(reply("/reverse   ")).toBe("用法：/reverse <文本>");
      expect(reply("/count")).toBe("用法：/count <文本>");
    });

    test("未知命令", () => {
      expect(reply("/dance")).toBe("未知命令：/dance。输入 /help 查看可用命令。");
    });

    test("未知命令的回复里不包含参数", () => {
      expect(reply("/dance salsa now")).toBe("未知命令：/dance。输入 /help 查看可用命令。");
    });

    test("命令名区分大小写", () => {
      expect(reply("/HELP")).toBe("未知命令：/HELP。输入 /help 查看可用命令。");
    });
  });
});

describe("shouldExit", () => {
  test("/exit 和 /quit 表示退出", () => {
    expect(shouldExit("/exit")).toBe(true);
    expect(shouldExit("/quit")).toBe(true);
  });

  test("忽略首尾空白", () => {
    expect(shouldExit("  /exit \n")).toBe(true);
  });

  test("其他输入不退出", () => {
    expect(shouldExit("exit")).toBe(false);
    expect(shouldExit("/exit now")).toBe(false);
    expect(shouldExit("")).toBe(false);
  });
});
