import { describe, expectTypeOf, test } from "vitest";
import type { QualifiedName, SplitToolName } from "./01-jsonrpc.ts";

describe("工具名的类型", () => {
  test("QualifiedName 拼出字面量", () => {
    expectTypeOf<QualifiedName<"github", "create_issue">>().toEqualTypeOf<"github__create_issue">();
  });

  test("SplitToolName 按第一次 __ 切开，切不开是 never", () => {
    expectTypeOf<SplitToolName<"github__create_issue">>().toEqualTypeOf<{
      server: "github";
      tool: "create_issue";
    }>();
    expectTypeOf<SplitToolName<"a__b__c">>().toEqualTypeOf<{ server: "a"; tool: "b__c" }>();
    expectTypeOf<SplitToolName<"search">>().toEqualTypeOf<never>();
    expectTypeOf<SplitToolName<"__tool">>().toEqualTypeOf<never>();
    expectTypeOf<SplitToolName<"server__">>().toEqualTypeOf<never>();
  });
});
