// 第 2 章项目：用你实现的工具注册表，模拟一次"模型调用工具"的过程
//
// 运行：pnpm tsx chapters/02-advanced-types/project/demo.ts
//
// 它调用的是你在 exercises/02-advanced-types/project/tool-registry.ts 里写的代码。
// 还没实现完时，会打印出是哪个函数还在 TODO。

import {
  createRegistry,
  defineTool,
  type RawToolCall,
} from "../../../exercises/02-advanced-types/project/tool-registry.ts";

try {
  // ── 1. 定义工具：参数描述只写一次 ─────────────────────────────────
  const weather = defineTool({
    name: "get_weather",
    description: "查询城市的天气",
    parameters: {
      city: { type: "string", description: "城市名，例如“北京”" },
      unit: { type: "enum", values: ["c", "f"], description: "温度单位", optional: true },
    },
    // 把鼠标悬停在 args 上：{ city: string; unit?: "c" | "f" }
    execute: (args) => {
      const celsius = 25;
      return args.unit === "f"
        ? `${args.city}：晴，${celsius * 1.8 + 32}°F`
        : `${args.city}：晴，${celsius}°C`;
    },
  });

  const calculator = defineTool({
    name: "add",
    description: "计算两个数的和",
    parameters: { a: { type: "number" }, b: { type: "number" } },
    execute: ({ a, b }) => a + b,
  });

  const tools = createRegistry().register(weather).register(calculator);

  // ── 2. 交给模型的工具说明 ─────────────────────────────────────────
  console.log("── 发送给模型的工具说明（JSON Schema） ──");
  console.log(JSON.stringify(tools.schemas(), null, 2));

  // ── 3. 在自己的代码里调用：名字、参数、返回值都有类型 ───────────────
  console.log("\n── 代码里直接调用 ──");
  const sum = tools.call("add", { a: 1, b: 2 }); // number
  console.log("add(1, 2) =", sum);

  // ── 4. 执行模型发来的调用：参数是 JSON 字符串，什么都可能发生 ─────────
  // 第 3 章会从真正的模型 API 拿到这些调用；第 6 章把结果作为 tool 消息交还给模型
  const callsFromModel: RawToolCall[] = [
    { id: "call_1", name: "get_weather", arguments: '{"city":"北京"}' },
    { id: "call_2", name: "get_weather", arguments: '{"city":"上海","unit":"kelvin"}' },
    { id: "call_3", name: "add", arguments: '{"a": 1, "b": "2"}' },
    { id: "call_4", name: "search", arguments: '{"query":"TypeScript"}' },
    { id: "call_5", name: "add", arguments: "{a: 1, b: 2}" },
  ];

  console.log("\n── 执行模型发来的调用 ──");
  for (const call of callsFromModel) {
    const result = tools.dispatch(call);
    console.log(
      result.ok
        ? `✓ ${call.id} ${call.name} → ${String(result.value)}`
        : `✗ ${call.id} ${call.name} → ${result.error}`,
    );
  }
} catch (error) {
  console.log(`还没完成：${error instanceof Error ? error.message : String(error)}`);
  console.log("运行 pnpm ex tool-registry 查看还有哪些测试没通过。");
}
