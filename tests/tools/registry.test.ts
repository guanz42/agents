import { describe, expect, it } from "vite-plus/test";
import { createToolRegistry } from "../../src/tools/registry.js";

describe("tool registry", () => {
  it("returns a tool by name", () => {
    const registry = createToolRegistry([
      { name: "demo_tool", description: "demo", execute: async () => ({ ok: true }) },
    ]);

    expect(registry.get("demo_tool")?.name).toBe("demo_tool");
  });

  it("lists all tools", () => {
    const registry = createToolRegistry([
      { name: "a", description: "a", execute: async () => ({ ok: true }) },
      { name: "b", description: "b", execute: async () => ({ ok: true }) },
    ]);

    expect(registry.list().map((tool) => tool.name)).toEqual(["a", "b"]);
  });

  it("throws when duplicate tool names are registered", () => {
    expect(() =>
      createToolRegistry([
        { name: "dup", description: "first", execute: async () => ({ ok: true }) },
        { name: "dup", description: "second", execute: async () => ({ ok: true }) },
      ]),
    ).toThrow("Duplicate tool name: dup");
  });
});
