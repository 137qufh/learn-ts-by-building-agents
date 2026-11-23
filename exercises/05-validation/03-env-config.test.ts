import { describe, expect, expectTypeOf, test } from "vitest";
import { ApiKey, describeConfig, loadConfig, maskKey, type Config } from "./03-env-config.ts";

const KEY = "sk-test-0123456789abcdef";
const minimal = { OPENAI_API_KEY: KEY, OPENAI_MODEL: "deepseek-chat" };

function errorsOf(env: Record<string, string | undefined>): string[] {
  const result = loadConfig(env);
  return result.ok ? [] : result.errors;
}

function configOf(env: Record<string, string | undefined>): Config {
  const result = loadConfig(env);
  if (!result.ok) {
    throw new Error(`预期成功，但失败了：\n${result.errors.join("\n")}`);
  }
  return result.config;
}

describe("loadConfig", () => {
  test("只设置必填的变量：其余用默认值", () => {
    expect(configOf(minimal)).toEqual({
      apiKey: KEY,
      model: "deepseek-chat",
      baseUrl: "https://api.openai.com/v1",
      maxRetries: 3,
      timeoutMs: 60_000,
      debug: false,
    });
  });

  test("全部设置", () => {
    expect(
      configOf({
        ...minimal,
        OPENAI_BASE_URL: "https://api.deepseek.com/v1",
        AGENT_MAX_RETRIES: "0",
        AGENT_TIMEOUT_MS: "120000",
        AGENT_DEBUG: "yes",
      }),
    ).toEqual({
      apiKey: KEY,
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com/v1",
      maxRetries: 0,
      timeoutMs: 120_000,
      debug: true,
    });
  });

  test("去掉首尾空白，去掉 URL 末尾的斜杠", () => {
    const config = configOf({
      OPENAI_API_KEY: `  ${KEY}\n`,
      OPENAI_MODEL: " qwen-plus ",
      OPENAI_BASE_URL: "http://localhost:11434/v1/",
      AGENT_MAX_RETRIES: " 5 ",
    });
    expect(config.apiKey).toBe(KEY);
    expect(config.model).toBe("qwen-plus");
    expect(config.baseUrl).toBe("http://localhost:11434/v1");
    expect(config.maxRetries).toBe(5);
  });

  test("空字符串当作没设置：用默认值，而不是 0", () => {
    const config = configOf({
      ...minimal,
      OPENAI_BASE_URL: "",
      AGENT_MAX_RETRIES: "",
      AGENT_TIMEOUT_MS: "   ",
      AGENT_DEBUG: "",
    });
    expect(config.baseUrl).toBe("https://api.openai.com/v1");
    expect(config.maxRetries).toBe(3);
    expect(config.timeoutMs).toBe(60_000);
    expect(config.debug).toBe(false);
  });

  test.each([
    ["true", true],
    ["1", true],
    ["on", true],
    ["false", false],
    ["0", false],
    ["no", false],
  ])("AGENT_DEBUG=%s → %s", (value, expected) => {
    expect(configOf({ ...minimal, AGENT_DEBUG: value }).debug).toBe(expected);
  });

  test("必填的变量没设置或为空：必须设置", () => {
    expect(errorsOf({ OPENAI_API_KEY: "  " })).toEqual([
      "OPENAI_API_KEY: 必须设置",
      "OPENAI_MODEL: 必须设置",
    ]);
  });

  test.each(["localhost:3000", "ftp://example.com", "不是网址"])(
    "OPENAI_BASE_URL=%s 不合法",
    (url) => {
      expect(errorsOf({ ...minimal, OPENAI_BASE_URL: url })).toEqual([
        "OPENAI_BASE_URL: 必须是 http 或 https 开头的 URL",
      ]);
    },
  );

  test.each([
    ["AGENT_MAX_RETRIES", "abc"],
    ["AGENT_MAX_RETRIES", "1.5"],
    ["AGENT_MAX_RETRIES", "11"],
    ["AGENT_MAX_RETRIES", "-1"],
    ["AGENT_TIMEOUT_MS", "0"],
    ["AGENT_TIMEOUT_MS", "600001"],
    ["AGENT_DEBUG", "maybe"],
  ])("%s=%s 不合法", (name, value) => {
    const errors = errorsOf({ ...minimal, [name]: value });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.startsWith(`${name}: `)).toBe(true);
  });

  test("所有问题一次报告完，而且不泄漏 API key", () => {
    const errors = errorsOf({
      OPENAI_API_KEY: KEY,
      OPENAI_BASE_URL: "nope",
      AGENT_MAX_RETRIES: "lots",
      AGENT_DEBUG: "sure",
    });
    expect(errors.map((e) => e.split(":")[0])).toEqual([
      "OPENAI_MODEL",
      "OPENAI_BASE_URL",
      "AGENT_MAX_RETRIES",
      "AGENT_DEBUG",
    ]);
    expect(errors.join("\n")).not.toContain(KEY);
  });

  test("不认识的环境变量不影响结果", () => {
    expect(configOf({ ...minimal, PATH: "/usr/bin", HOME: "/root" }).model).toBe("deepseek-chat");
  });

  test("类型：apiKey 是品牌类型，普通字符串不能冒充", () => {
    expectTypeOf<Config["apiKey"]>().toEqualTypeOf<ApiKey>();
    expectTypeOf<string>().not.toExtend<ApiKey>();
  });
});

describe("maskKey 和 describeConfig", () => {
  test("遮住 API key", () => {
    expect(maskKey(ApiKey.parse("sk-test-0123456789abcdef"))).toBe("sk-…cdef");
    expect(maskKey(ApiKey.parse("short"))).toBe("****");
    expect(maskKey(ApiKey.parse("12345678"))).toBe("****");
  });

  test("配置摘要", () => {
    const config = configOf({ ...minimal, AGENT_DEBUG: "1" });
    expect(describeConfig(config)).toBe(
      [
        "模型：deepseek-chat",
        "地址：https://api.openai.com/v1",
        "API key：sk-…cdef",
        "重试：3 次，超时：60000ms",
        "调试：开",
      ].join("\n"),
    );
    expect(describeConfig(config)).not.toContain(KEY);
  });
});
