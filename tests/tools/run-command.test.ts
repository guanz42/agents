import { describe, expect, it } from "bun:test";
import { createRunCommandTool, runCommandSchema } from "../../src/tools/run-command.js";

describe("run_command tool", () => {
  it("runs a successful command", async () => {
    const tool = createRunCommandTool(process.cwd());

    const result = await tool.execute({ command: "node -e \"console.log('ok')\"" });

    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe("ok");
    expect(result.exitCode).toBe(0);
  });

  it("exposes the expected input schema", () => {
    const tool = createRunCommandTool(process.cwd());
    expect(tool.schema).toBe(runCommandSchema);
  });

  it("returns structured failure data for a failing command", async () => {
    const tool = createRunCommandTool(process.cwd());

    const result = await tool.execute({ command: 'node -e "process.exit(3)"' });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(3);
    expect(result.stdout).toBeTypeOf("string");
    expect(result.stderr).toBeTypeOf("string");
  });
});
