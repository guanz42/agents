import type { Command } from "commander";
import * as readline from "node:readline";
import { runOrchestrator, type OrchestratorResult } from "../agents/orchestrator.js";
import { buildProgram, type CommandHandlers } from "../cli/program.js";
import { createCliRenderers, type CliRenderers } from "../cli/renderers.js";
import { createProvider } from "../providers/factory.js";
import { SessionStoreError, createSessionStore } from "../session/store.js";
import { createReadFileTool } from "../tools/read-file.js";
import { createRunCommandTool } from "../tools/run-command.js";
import { createSearchCodeTool } from "../tools/search-code.js";
import { createToolRegistry, type ToolDefinition } from "../tools/registry.js";
import { createWriteFileTool } from "../tools/write-file.js";
import { loadConfig, type AppConfig } from "./config.js";

export interface BootstrapResult {
  program: Command;
}

export interface RunTaskInput {
  task: string;
  config?: Partial<AppConfig>;
  workspaceRoot?: string;
  onTextDelta?: (chunk: string) => void | Promise<void>;
  orchestratorRunner?: (
    input: Parameters<typeof runOrchestrator>[0],
  ) => Promise<OrchestratorResult>;
}

export interface RunTaskResult {
  sessionId: string;
  summary: string;
}

export interface CommandHandlerDeps {
  config?: Partial<AppConfig>;
  workspaceRoot?: string;
  runTaskFn?: (input: RunTaskInput) => Promise<RunTaskResult>;
}

function resolveProviderFromEnv(): AppConfig["provider"] | undefined {
  const provider = process.env.AGENT_PROVIDER;

  if (provider === "openai" || provider === "anthropic" || provider === "openai-compatible") {
    return provider;
  }

  return undefined;
}

function getConfigFromEnv(): Partial<AppConfig> {
  return {
    provider: resolveProviderFromEnv(),
    model: process.env.AGENT_MODEL,
    sessionDir: process.env.AGENT_SESSION_DIR,
  };
}

function sanitizeToolInput(input: unknown): Record<string, unknown> {
  if (typeof input === "object" && input !== null) {
    return input as Record<string, unknown>;
  }

  return { value: String(input) };
}

function sanitizeToolOutput(output: unknown): Record<string, unknown> {
  if (typeof output === "object" && output !== null) {
    return output as Record<string, unknown>;
  }

  return { value: String(output) };
}

const DEFAULT_CHAT_TASK =
  "Inspect the current workspace and provide a short summary of what you find.";

const EXIT_COMMANDS = new Set(["/quit", "/exit", "/q", "exit", "quit", "bye"]);

const DANGEROUS_OPERATIONS = new Set([
  "rm -rf",
  "del /s",
  "format",
  "mkfs",
  "dd if=/dev/zero",
  "chmod -R 777",
  "chown -R",
  "rmdir /s",
]);

function checkDangerousOperation(input: string): { isDangerous: boolean; reason?: string } {
  const lowerInput = input.toLowerCase();

  for (const dangerous of DANGEROUS_OPERATIONS) {
    if (lowerInput.includes(dangerous.toLowerCase())) {
      return {
        isDangerous: true,
        reason: `Operation contains potentially dangerous command: ${dangerous}`,
      };
    }
  }

  return { isDangerous: false };
}

function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
    terminal: true,
  });
}

async function promptUser(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rlAny = rl as any;
    const onClose = () => reject(new Error("readline closed"));

    rlAny.once("close", onClose);

    rl.question(question, (answer) => {
      rlAny.removeListener("close", onClose);
      resolve(answer);
    });
  });
}

function buildConversationContext(
  events: Array<{ type: string; payload: Record<string, unknown> }>,
): Array<{
  role: "user" | "assistant";
  content: string;
}> {
  const context: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const event of events) {
    if (event.type === "user_message" && typeof event.payload.content === "string") {
      context.push({ role: "user", content: event.payload.content });
    } else if (event.type === "agent_message" && typeof event.payload.content === "string") {
      context.push({ role: "assistant", content: event.payload.content });
    }
  }

  return context;
}

function getProviderApiKey(provider: AppConfig["provider"]): string | undefined {
  if (provider === "openai" || provider === "openai-compatible") {
    return process.env.OPENAI_API_KEY;
  }

  if (provider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY;
  }

  return undefined;
}

function getProviderBaseUrl(): string | undefined {
  return process.env.OPENAI_BASE_URL;
}

export async function runTask(input: RunTaskInput): Promise<RunTaskResult> {
  const config = loadConfig({
    ...getConfigFromEnv(),
    ...input.config,
  });
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  const provider = createProvider({
    provider: config.provider,
    model: config.model,
    apiKey: getProviderApiKey(config.provider),
    baseUrl: getProviderBaseUrl(),
  });
  const store = createSessionStore(config.sessionDir);
  const session = await store.startSession({ task: input.task });

  const baseTools = createToolRegistry([
    createReadFileTool(workspaceRoot),
    createWriteFileTool(workspaceRoot),
    createSearchCodeTool(workspaceRoot),
    createRunCommandTool(workspaceRoot),
  ]).list();
  const tools = baseTools.map(
    (tool): ToolDefinition => ({
      ...tool,
      async execute(toolInput: unknown): Promise<unknown> {
        await store.appendEvent(session.id, {
          type: "tool_call",
          payload: {
            tool: tool.name,
            input: sanitizeToolInput(toolInput),
          },
        });

        const output = await tool.execute(toolInput);

        await store.appendEvent(session.id, {
          type: "tool_result",
          payload: {
            tool: tool.name,
            output: sanitizeToolOutput(output),
          },
        });

        return output;
      },
    }),
  );

  await store.appendEvent(session.id, {
    type: "user_task",
    payload: { task: input.task },
  });

  try {
    const orchestratorRunner = input.orchestratorRunner ?? runOrchestrator;
    const result = await orchestratorRunner({
      task: input.task,
      provider,
      tools,
      onTextDelta: input.onTextDelta,
    });

    await store.appendEvent(session.id, {
      type: "delegation",
      payload: {
        delegatedAgent: result.delegatedAgent,
      },
    });

    await store.appendEvent(session.id, {
      type: "final_result",
      payload: {
        delegatedAgent: result.delegatedAgent,
        summary: result.summary,
      },
    });
    await store.updateStatus(session.id, "completed");

    return {
      sessionId: session.id,
      summary: result.summary,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown orchestrator error";

    await store.appendEvent(session.id, {
      type: "final_result",
      payload: { error: errorMessage },
    });
    await store.updateStatus(session.id, "failed");

    throw error;
  }
}

export function createCommandHandlers(
  renderers: CliRenderers,
  deps: CommandHandlerDeps = {},
): CommandHandlers {
  const runTaskFn = deps.runTaskFn ?? runTask;

  return {
    chat: async () => {
      const config = loadConfig({
        ...getConfigFromEnv(),
        ...deps.config,
      });
      const workspaceRoot = deps.workspaceRoot ?? process.cwd();
      const provider = createProvider({
        provider: config.provider,
        model: config.model,
        apiKey: getProviderApiKey(config.provider),
        baseUrl: getProviderBaseUrl(),
      });
      const store = createSessionStore(config.sessionDir);

      const session = await store.startSession({ task: "Interactive chat session" });

      renderers.info("Starting interactive chat session. Type /quit or /exit to end.");
      renderers.info(`Session ID: ${session.id}`);
      renderers.info("");

      const rl = createReadlineInterface();
      rl.prompt();

      const cleanup = async () => {
        rl.close();
        await store.updateStatus(session.id, "completed");
      };

      const rlAny = rl as any;
      rlAny.on("close", async () => {
        renderers.info("");
        renderers.info("Session ended.");
        await cleanup();
        process.exit(0);
      });

      try {
        const baseTools = createToolRegistry([
          createReadFileTool(workspaceRoot),
          createWriteFileTool(workspaceRoot),
          createSearchCodeTool(workspaceRoot),
          createRunCommandTool(workspaceRoot),
        ]).list();

        const tools = baseTools.map(
          (tool): ToolDefinition => ({
            ...tool,
            async execute(toolInput: unknown): Promise<unknown> {
              await store.appendEvent(session.id, {
                type: "tool_call",
                payload: {
                  tool: tool.name,
                  input: sanitizeToolInput(toolInput),
                },
              });

              const output = await tool.execute(toolInput);

              await store.appendEvent(session.id, {
                type: "tool_result",
                payload: {
                  tool: tool.name,
                  output: sanitizeToolOutput(output),
                },
              });

              return output;
            },
          }),
        );

        let running = true;

        while (running) {
          let userInput: string;

          try {
            userInput = await promptUser(rl, "");
          } catch (err) {
            // readline closed (e.g., Ctrl+D or pipe input ended)
            running = false;
            continue;
          }

          const trimmedInput = userInput.trim();

          if (EXIT_COMMANDS.has(trimmedInput.toLowerCase())) {
            renderers.info("");
            renderers.info("Ending chat session.");
            running = false;
            continue;
          }

          if (trimmedInput.length === 0) {
            rl.prompt();
            continue;
          }

          const dangerCheck = checkDangerousOperation(trimmedInput);
          if (dangerCheck.isDangerous) {
            renderers.info("");
            renderers.info(`Warning: ${dangerCheck.reason}`);
            let confirm: string;
            try {
              confirm = await promptUser(rl, "Are you sure you want to proceed? (yes/no): ");
            } catch (err) {
              renderers.info("Operation cancelled (input ended).");
              renderers.info("");
              rl.prompt();
              continue;
            }
            if (confirm.toLowerCase() !== "yes") {
              renderers.info("Operation cancelled.");
              renderers.info("");
              rl.prompt();
              continue;
            }
          }

          await store.appendEvent(session.id, {
            type: "user_message",
            payload: { content: trimmedInput },
          });

          const currentSession = await store.readSession(session.id);
          const conversationHistory = buildConversationContext(currentSession.events);

          let streamedOutput = false;
          let agentResponse = "";

          const result = await runOrchestrator({
            task: trimmedInput,
            provider,
            tools,
            conversationHistory:
              conversationHistory.length > 2 ? conversationHistory.slice(-2) : undefined,
            onTextDelta: (chunk: string) => {
              streamedOutput = renderers.stream(chunk) || streamedOutput;
              agentResponse += chunk;
            },
          });

          if (!streamedOutput && agentResponse.length === 0 && result.summary) {
            renderers.info(result.summary);
            agentResponse = result.summary;
          }

          renderers.info("");
          renderers.info("");

          await store.appendEvent(session.id, {
            type: "agent_message",
            payload: { content: agentResponse || result.summary },
          });

          await store.appendEvent(session.id, {
            type: "delegation",
            payload: {
              delegatedAgent: result.delegatedAgent,
            },
          });

          rl.prompt();
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown runtime error";
        renderers.error(`chat error: ${errorMessage}`);

        await store.appendEvent(session.id, {
          type: "final_result",
          payload: { error: errorMessage },
        });
        await store.updateStatus(session.id, "failed");
      }
    },
    run: async (task: string) => {
      try {
        let streamedOutput = false;
        const result = await runTaskFn({
          task,
          config: deps.config,
          workspaceRoot: deps.workspaceRoot,
          onTextDelta: (chunk: string) => {
            streamedOutput = renderers.stream(chunk) || streamedOutput;
          },
        });

        renderers.info(`session: ${result.sessionId}`);
        if (!streamedOutput) {
          renderers.info(result.summary);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown runtime error";
        renderers.error(`run failed: ${errorMessage}`);
      }
    },
    resume: async (sessionId: string) => {
      const config = loadConfig({
        ...getConfigFromEnv(),
        ...deps.config,
      });
      const store = createSessionStore(config.sessionDir);

      try {
        const session = await store.readSession(sessionId);
        renderers.info(
          `${session.id} | ${session.status} | ${session.task} | ${session.createdAt}`,
        );
        renderers.info(`events=${session.events.length}`);

        const lastDelegation = [...session.events]
          .reverse()
          .find((event) => event.type === "delegation");
        if (lastDelegation) {
          renderers.info(
            `delegatedAgent=${String(lastDelegation.payload.delegatedAgent ?? "none")}`,
          );
        }

        const lastFinalResult = [...session.events]
          .reverse()
          .find((event) => event.type === "final_result");
        if (lastFinalResult) {
          if (
            typeof lastFinalResult.payload.summary === "string" &&
            lastFinalResult.payload.summary.length > 0
          ) {
            renderers.info(lastFinalResult.payload.summary);
          } else if (typeof lastFinalResult.payload.error === "string") {
            renderers.error(lastFinalResult.payload.error);
          }
        }
      } catch (error) {
        if (error instanceof SessionStoreError || error instanceof Error) {
          renderers.error(`resume failed: ${error.message}`);
          return;
        }

        renderers.error("resume failed: unknown session store error");
      }
    },
    history: async () => {
      const config = loadConfig({
        ...getConfigFromEnv(),
        ...deps.config,
      });
      const store = createSessionStore(config.sessionDir);
      const sessions = await store.listSessions();

      if (sessions.length === 0) {
        renderers.info("No sessions found.");
        return;
      }

      for (const session of sessions) {
        renderers.info(
          `${session.id} | ${session.status} | ${session.task} | ${session.createdAt} | events=${session.events.length}`,
        );
      }
    },
  };
}

export interface BootstrapOptions {
  renderers?: CliRenderers;
  commandHandlerDeps?: CommandHandlerDeps;
}

export function bootstrapApp(options: BootstrapOptions = {}): BootstrapResult {
  const renderers = options.renderers ?? createCliRenderers();
  const handlers = createCommandHandlers(renderers, options.commandHandlerDeps);

  return {
    program: buildProgram(handlers),
  };
}
