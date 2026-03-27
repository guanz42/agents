import { Command } from "commander";

export interface CommandHandlers {
  chat(initialTask?: string): Promise<void> | void;
  resume(sessionId: string): Promise<void> | void;
  history(): Promise<void> | void;
}

function createDefaultHandlers(): CommandHandlers {
  return {
    chat: () => undefined,
    resume: () => undefined,
    history: () => undefined,
  };
}

export function buildProgram(handlers: CommandHandlers = createDefaultHandlers()): Command {
  const program = new Command().name("agent");

  program
    .command("chat", { isDefault: true })
    .description("Start an interactive agent session")
    .argument("[initialTask]", "Optional initial task to execute")
    .action(async (initialTask?: string) => {
      await handlers.chat(initialTask);
    });

  program
    .command("resume")
    .argument("<sessionId>")
    .description("Resume a previous session")
    .action(async (sessionId: string) => {
      await handlers.resume(sessionId);
    });

  program
    .command("history")
    .description("List previous sessions")
    .action(async () => {
      await handlers.history();
    });

  return program;
}
