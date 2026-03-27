import { describe, expect, it, vi } from "bun:test";
import { createCliRenderers } from "../../src/cli/renderers.js";

describe("createCliRenderers", () => {
  it("does not add an extra blank line after a streamed chunk ending with newline", () => {
    const output = {
      log: vi.fn(),
      error: vi.fn(),
      write: vi.fn(),
    };
    const renderers = createCliRenderers(output);

    expect(renderers.stream("hello\n")).toBe(true);
    renderers.info("session: session-123");

    expect(output.write).toHaveBeenCalledTimes(1);
    expect(output.write).toHaveBeenCalledWith("hello\n");
    expect(output.log).toHaveBeenCalledWith("session: session-123");
  });

  it("treats empty streamed chunks as non-output", () => {
    const output = {
      log: vi.fn(),
      error: vi.fn(),
      write: vi.fn(),
    };
    const renderers = createCliRenderers(output);

    expect(renderers.stream("")).toBe(false);
    renderers.info("session: session-123");

    expect(output.write).not.toHaveBeenCalled();
    expect(output.log).toHaveBeenCalledWith("session: session-123");
  });
});
