import { describe, expect, it, vi } from "vite-plus/test";
import { buildProgram } from "../../src/cli/program.js";

describe("agent chat command", () => {
  it("invokes the chat action handler via parseAsync", async () => {
    const handlers = {
      chat: vi.fn(),
      resume: vi.fn(),
      history: vi.fn(),
    };

    const program = buildProgram(handlers);
    await program.parseAsync(["node", "agent", "chat"]);

    expect(handlers.chat).toHaveBeenCalledTimes(1);
    expect(handlers.resume).not.toHaveBeenCalled();
    expect(handlers.history).not.toHaveBeenCalled();
  });

  it("invokes chat as default command when no command is specified", async () => {
    const handlers = {
      chat: vi.fn(),
      resume: vi.fn(),
      history: vi.fn(),
    };

    const program = buildProgram(handlers);
    await program.parseAsync(["node", "agent"]);

    expect(handlers.chat).toHaveBeenCalledTimes(1);
    expect(handlers.resume).not.toHaveBeenCalled();
    expect(handlers.history).not.toHaveBeenCalled();
  });

  it("invokes chat as default command with initial task", async () => {
    const handlers = {
      chat: vi.fn(),
      resume: vi.fn(),
      history: vi.fn(),
    };

    const program = buildProgram(handlers);
    await program.parseAsync(["node", "agent", "Inspect the code"]);

    expect(handlers.chat).toHaveBeenCalledWith("Inspect the code");
  });

  it("keeps the approved command surface limited to three commands", () => {
    const program = buildProgram();
    const commandNames = program.commands.map((command) => command.name()).sort();

    expect(commandNames).toEqual(["chat", "history", "resume"]);
  });
});
