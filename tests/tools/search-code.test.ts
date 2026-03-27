import { chmodSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { createSearchCodeTool, searchCodeSchema } from "../../src/tools/search-code.js";

describe("search_code tool", () => {
  it("returns matches from source files under the workspace", async () => {
    const workspaceRoot = path.join(process.cwd(), "tests/fixtures/sample-repo");
    const tool = createSearchCodeTool(workspaceRoot);

    const result = await tool.execute({ query: "hello" });

    expect(result.ok).toBe(true);
    expect(result.query).toBe("hello");
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0]).toMatchObject({
      path: expect.stringContaining("src/hello.ts"),
      line: expect.any(Number),
      preview: expect.stringContaining("hello"),
    });
  });

  it("exposes the expected input schema", () => {
    const tool = createSearchCodeTool(process.cwd());
    expect(tool.schema).toBe(searchCodeSchema);
  });

  it("ignores node_modules while searching", async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), "tool-search-"));
    mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
    mkdirSync(path.join(workspaceRoot, "node_modules/pkg"), { recursive: true });

    writeFileSync(
      path.join(workspaceRoot, "src/app.ts"),
      'export const value = "needle"\n',
      "utf8",
    );
    writeFileSync(
      path.join(workspaceRoot, "node_modules/pkg/index.js"),
      'const hidden = "needle"\n',
      "utf8",
    );

    const tool = createSearchCodeTool(workspaceRoot);
    const result = await tool.execute({ query: "needle" });

    expect(result.ok).toBe(true);
    expect(result.matches.some((match) => match.path.includes("src/app.ts"))).toBe(true);
    expect(result.matches.some((match) => match.path.includes("node_modules"))).toBe(false);
  });

  it("skips binary files instead of treating them as UTF-8 text", async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), "tool-search-"));
    mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });

    writeFileSync(path.join(workspaceRoot, "src/app.ts"), 'const greeting = "hello"\n', "utf8");
    writeFileSync(
      path.join(workspaceRoot, "src/blob.bin"),
      Buffer.from([0x68, 0x65, 0x6c, 0x00, 0x6f]),
    );

    const tool = createSearchCodeTool(workspaceRoot);
    const result = await tool.execute({ query: "hello" });

    expect(result.ok).toBe(true);
    expect(result.matches.some((match) => match.path.includes("app.ts"))).toBe(true);
    expect(result.matches.some((match) => match.path.includes("blob.bin"))).toBe(false);
  });

  it("skips oversized files before reading file contents", async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), "tool-search-"));
    mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });

    writeFileSync(path.join(workspaceRoot, "src/app.ts"), 'const marker = "needle"\n', "utf8");

    const blockedFile = path.join(workspaceRoot, "src/blocked.txt");
    writeFileSync(blockedFile, `${"a".repeat(128 * 1024 + 1)}needle`, "utf8");
    chmodSync(blockedFile, 0);

    try {
      const tool = createSearchCodeTool(workspaceRoot);
      const result = await tool.execute({ query: "needle" });

      expect(result.ok).toBe(true);
      expect(result.matches.some((match) => match.path.includes("app.ts"))).toBe(true);
      expect(result.matches.some((match) => match.path.includes("blocked.txt"))).toBe(false);
    } finally {
      chmodSync(blockedFile, 0o600);
    }
  });
});
