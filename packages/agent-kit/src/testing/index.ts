/**
 * @learn-ts/agent-kit/testing：给使用者写测试用的工具。
 *
 * - createFakeOpenAI：假的 OpenAI 兼容服务器（一个 fetch 函数），测试客户端和 HTTP 这一层（第 3、4 章）
 * - createScriptedModel：按脚本回复的假模型，直接实现 Model 接口，测试 harness 的逻辑（第 6 章）
 */
export * from "./fake-openai.ts";
export * from "./scripted-model.ts";
