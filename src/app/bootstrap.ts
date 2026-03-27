import type { Command } from 'commander'
import { runOrchestrator, type OrchestratorResult } from '../agents/orchestrator.js'
import { buildProgram, type CommandHandlers } from '../cli/program.js'
import { createCliRenderers, type CliRenderers } from '../cli/renderers.js'
import { loadConfig, type AppConfig } from './config.js'
import { createProvider } from '../providers/factory.js'
import { SessionStoreError, createSessionStore } from '../session/store.js'
import { createReadFileTool } from '../tools/read-file.js'
import { createRunCommandTool } from '../tools/run-command.js'
import { createSearchCodeTool } from '../tools/search-code.js'
import { createToolRegistry, type ToolDefinition } from '../tools/registry.js'
import { createWriteFileTool } from '../tools/write-file.js'

export interface BootstrapResult {
  program: Command
}

export interface RunTaskInput {
  task: string
  config?: Partial<AppConfig>
  workspaceRoot?: string
  orchestratorRunner?: (input: Parameters<typeof runOrchestrator>[0]) => Promise<OrchestratorResult>
}

export interface RunTaskResult {
  sessionId: string
  summary: string
}

export interface CommandHandlerDeps {
  config?: Partial<AppConfig>
  workspaceRoot?: string
  runTaskFn?: (input: RunTaskInput) => Promise<RunTaskResult>
}

function resolveProviderFromEnv(): AppConfig['provider'] | undefined {
  const provider = process.env.AGENT_PROVIDER

  if (provider === 'openai' || provider === 'anthropic' || provider === 'openai-compatible') {
    return provider
  }

  return undefined
}

function getConfigFromEnv(): Partial<AppConfig> {
  return {
    provider: resolveProviderFromEnv(),
    model: process.env.AGENT_MODEL,
    sessionDir: process.env.AGENT_SESSION_DIR
  }
}

function sanitizeToolInput(input: unknown): Record<string, unknown> {
  if (typeof input === 'object' && input !== null) {
    return input as Record<string, unknown>
  }

  return { value: String(input) }
}

function sanitizeToolOutput(output: unknown): Record<string, unknown> {
  if (typeof output === 'object' && output !== null) {
    return output as Record<string, unknown>
  }

  return { value: String(output) }
}

const DEFAULT_CHAT_TASK = 'Inspect the current workspace and provide a short summary of what you find.'

function getProviderApiKey(provider: AppConfig['provider']): string | undefined {
  if (provider === 'openai' || provider === 'openai-compatible') {
    return process.env.OPENAI_API_KEY
  }

  if (provider === 'anthropic') {
    return process.env.ANTHROPIC_API_KEY
  }

  return undefined
}

function getProviderBaseUrl(): string | undefined {
  return process.env.OPENAI_BASE_URL
}

export async function runTask(input: RunTaskInput): Promise<RunTaskResult> {
  const config = loadConfig({
    ...getConfigFromEnv(),
    ...(input.config ?? {})
  })
  const workspaceRoot = input.workspaceRoot ?? process.cwd()
  const provider = createProvider({
    provider: config.provider,
    model: config.model,
    apiKey: getProviderApiKey(config.provider),
    baseUrl: getProviderBaseUrl()
  })
  const store = createSessionStore(config.sessionDir)
  const session = await store.startSession({ task: input.task })

  const baseTools = createToolRegistry([
    createReadFileTool(workspaceRoot),
    createWriteFileTool(workspaceRoot),
    createSearchCodeTool(workspaceRoot),
    createRunCommandTool(workspaceRoot)
  ]).list()
  const tools = baseTools.map((tool): ToolDefinition => ({
    ...tool,
    async execute(toolInput: unknown): Promise<unknown> {
      await store.appendEvent(session.id, {
        type: 'tool_call',
        payload: {
          tool: tool.name,
          input: sanitizeToolInput(toolInput)
        }
      })

      const output = await tool.execute(toolInput)

      await store.appendEvent(session.id, {
        type: 'tool_result',
        payload: {
          tool: tool.name,
          output: sanitizeToolOutput(output)
        }
      })

      return output
    }
  }))

  await store.appendEvent(session.id, {
    type: 'user_task',
    payload: { task: input.task }
  })

  try {
    const orchestratorRunner = input.orchestratorRunner ?? runOrchestrator
    const result = await orchestratorRunner({ task: input.task, provider, tools })

    await store.appendEvent(session.id, {
      type: 'delegation',
      payload: {
        delegatedAgent: result.delegatedAgent
      }
    })

    await store.appendEvent(session.id, {
      type: 'final_result',
      payload: {
        delegatedAgent: result.delegatedAgent,
        summary: result.summary
      }
    })
    await store.updateStatus(session.id, 'completed')

    return {
      sessionId: session.id,
      summary: result.summary
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown orchestrator error'

    await store.appendEvent(session.id, {
      type: 'final_result',
      payload: { error: errorMessage }
    })
    await store.updateStatus(session.id, 'failed')

    throw error
  }
}

export function createCommandHandlers(
  renderers: CliRenderers,
  deps: CommandHandlerDeps = {}
): CommandHandlers {
  const runTaskFn = deps.runTaskFn ?? runTask

  return {
    chat: async () => {
      try {
        const result = await runTaskFn({
          task: DEFAULT_CHAT_TASK,
          config: deps.config,
          workspaceRoot: deps.workspaceRoot
        })

        renderers.info('chat demo executed one local turn')
        renderers.info(`session: ${result.sessionId}`)
        renderers.info(result.summary)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown runtime error'
        renderers.error(`chat failed: ${errorMessage}`)
      }
    },
    run: async (task: string) => {
      try {
        const result = await runTaskFn({
          task,
          config: deps.config,
          workspaceRoot: deps.workspaceRoot
        })

        renderers.info(`session: ${result.sessionId}`)
        renderers.info(result.summary)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown runtime error'
        renderers.error(`run failed: ${errorMessage}`)
      }
    },
    resume: async (sessionId: string) => {
      const config = loadConfig({
        ...getConfigFromEnv(),
        ...(deps.config ?? {})
      })
      const store = createSessionStore(config.sessionDir)

      try {
        const session = await store.readSession(sessionId)
        renderers.info(`${session.id} | ${session.status} | ${session.task} | ${session.createdAt}`)
        renderers.info(`events=${session.events.length}`)

        const lastDelegation = [...session.events]
          .reverse()
          .find((event) => event.type === 'delegation')
        if (lastDelegation) {
          renderers.info(`delegatedAgent=${String(lastDelegation.payload.delegatedAgent ?? 'none')}`)
        }

        const lastFinalResult = [...session.events].reverse().find((event) => event.type === 'final_result')
        if (lastFinalResult) {
          if (typeof lastFinalResult.payload.summary === 'string' && lastFinalResult.payload.summary.length > 0) {
            renderers.info(lastFinalResult.payload.summary)
          } else if (typeof lastFinalResult.payload.error === 'string') {
            renderers.error(lastFinalResult.payload.error)
          }
        }
      } catch (error) {
        if (error instanceof SessionStoreError || error instanceof Error) {
          renderers.error(`resume failed: ${error.message}`)
          return
        }

        renderers.error('resume failed: unknown session store error')
      }
    },
    history: async () => {
      const config = loadConfig({
        ...getConfigFromEnv(),
        ...(deps.config ?? {})
      })
      const store = createSessionStore(config.sessionDir)
      const sessions = await store.listSessions()

      if (sessions.length === 0) {
        renderers.info('No sessions found.')
        return
      }

      for (const session of sessions) {
        renderers.info(
          `${session.id} | ${session.status} | ${session.task} | ${session.createdAt} | events=${session.events.length}`
        )
      }
    }
  }
}

export interface BootstrapOptions {
  renderers?: CliRenderers
  commandHandlerDeps?: CommandHandlerDeps
}

export function bootstrapApp(options: BootstrapOptions = {}): BootstrapResult {
  const renderers = options.renderers ?? createCliRenderers()
  const handlers = createCommandHandlers(renderers, options.commandHandlerDeps)

  return {
    program: buildProgram(handlers)
  }
}
