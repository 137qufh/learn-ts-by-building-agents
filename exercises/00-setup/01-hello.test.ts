import { describe, expect, test } from "vitest";
import { greet } from "./01-hello.ts";

describe("greet", () => {
  test("向名字打招呼", () => {
    expect(greet("Ada")).toBe("Hello, Ada!");
  });

  test("去掉名字前后的空白", () => {
    expect(greet("  Ada \n")).toBe("Hello, Ada!");
  });

  test("保留名字中间的空格", () => {
    expect(greet("Ada Lovelace")).toBe("Hello, Ada Lovelace!");
  });

  test("名字为空时称呼 stranger", () => {
    expect(greet("")).toBe("Hello, stranger!");
  });

  test("名字只有空白时也称呼 stranger", () => {
    expect(greet("   ")).toBe("Hello, stranger!");
  });
});
