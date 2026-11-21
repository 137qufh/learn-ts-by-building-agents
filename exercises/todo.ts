/**
 * 练习里还没实现的地方都调用 `todo()`。
 *
 * 它的返回类型是 `never`（"永远不会正常返回"，第 1 章会讲），所以写在任何
 * 需要返回值的函数里都能通过类型检查，而运行时一定会抛错，让测试失败。
 */
export function todo(hint = "还没实现"): never {
  throw new Error(`TODO: ${hint}`);
}
