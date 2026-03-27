import {
  adaptToolsForAgentSdk,
  chooseSubAgent,
  createDelegatedAgent
} from '../../src/agents/delegation.js'
import { runOrchestrator } from '../../src/agents/orchestrator.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runMock = vi.hoisted(() => vi.fn())

vi.mock('@openai/agents', () => {
  class MockAgent {
    name: string
    instructions?: string
    model?: unknown
    tools?: unknown[]

    constructor(config: { name: string; instructions?: string; model?: unknown; tools?: unknown[] }) {
      this.name = config.name
      this.instructions = config.instructions
      this.model = config.model
      this.tools = config.tools
    }
  }

  return {
    Agent: MockAgent,
    run: runMock,
    tool: ({ name, description, parameters, execute }: {
      name: string
      description: string
      parameters: unknown
      execute: (input: Record<string, unknown>) => Promise<unknown> | unknown
    }) => ({
      type: 'function',
      name,
      description,
      parameters,
      strict: true,
      invoke: execute,
      needsApproval: false
    })
  }
})

beforeEach(() => {
  runMock.mockReset()
})

describe('chooseSubAgent', () => {
  it('routes repository inspection work to research-agent', () => {
    expect(chooseSubAgent('Inspect the repo structure and summarize it')).toBe('research-agent')
  })

  it('routes implementation work to coding-agent', () => {
    expect(chooseSubAgent('Implement a new parser and add error handling')).toBe('coding-agent')
  })

  it('routes review work to reviewer-agent', () => {
    expect(chooseSubAgent('Review the result and check for regressions')).toBe('reviewer-agent')
  })

  it('routes common coding verbs to coding-agent', () => {
    expect(chooseSubAgent('Fix and debug the failing tests')).toBe('coding-agent')
    expect(chooseSubAgent('Update the parser implementation')).toBe('coding-agent')
  })

  it('routes examine-style research requests to research-agent', () => {
    expect(chooseSubAgent('Examine the module boundaries')).toBe('research-agent')
  })

  it('keeps coding precedence over research in mixed tasks', () => {
    expect(chooseSubAgent('Analyze the bug and fix it')).toBe('coding-agent')
  })

  it('returns null when task does not match delegation keywords', () => {
    expect(chooseSubAgent('Hello there')).toBeNull()
  })

  it('avoids false positives from partial word matches like address/rewrite', () => {
    expect(chooseSubAgent('The address formatting needs a rewrite.')).toBeNull()
  })
})

describe('createDelegatedAgent', () => {
  const tools = adaptToolsForAgentSdk([])
  const model = 'gpt-4.1'

  it('maps research role to research-agent', () => {
    const agent = createDelegatedAgent('research-agent', tools, model)
    expect(agent?.name).toBe('research-agent')
  })

  it('maps coding role to coding-agent', () => {
    const agent = createDelegatedAgent('coding-agent', tools, model)
    expect(agent?.name).toBe('coding-agent')
  })

  it('maps reviewer role to reviewer-agent', () => {
    const agent = createDelegatedAgent('reviewer-agent', tools, model)
    expect(agent?.name).toBe('reviewer-agent')
  })

  it('returns null when role is null', () => {
    expect(createDelegatedAgent(null, tools, model)).toBeNull()
  })
})

describe('runOrchestrator', () => {
  it('delegates to coding-agent when routing matches coding work', async () => {
    runMock.mockResolvedValue({ finalOutput: 'delegated summary' })

    const result = await runOrchestrator({
      task: 'Debug the failing workflow',
      tools: [],
      provider: {
        name: 'openai',
        model: 'gpt-4.1',
        createModel: async () => ({ provider: 'anthropic', model: 'claude-3-7', status: 'planned-extension' })
      }
    })

    expect(result.delegatedAgent).toBe('coding-agent')
    expect(result.summary).toBe('delegated summary')
    expect(runMock).toHaveBeenCalledTimes(1)
    expect(runMock.mock.calls[0][0].name).toBe('coding-agent')
    expect(runMock.mock.calls[0][0].model).toBe('gpt-4.1')
  })

  it('uses fallback orchestrator model object and stringifies object output', async () => {
    const resolvedModel = {
      getResponse: vi.fn(),
      getStreamedResponse: vi.fn()
    }
    const createModel = vi.fn(async () => resolvedModel)
    runMock.mockResolvedValue({ finalOutput: { ok: true } })

    const result = await runOrchestrator({
      task: 'Say hello politely',
      tools: [],
      provider: {
        name: 'openai',
        model: 'gpt-4.1',
        createModel
      }
    })

    expect(result.delegatedAgent).toBeNull()
    expect(result.summary).toBe('{"ok":true}')
    expect(createModel).toHaveBeenCalledTimes(1)
    expect(runMock.mock.calls[0][0].name).toBe('orchestrator')
    expect(runMock.mock.calls[0][0].model).toBe(resolvedModel)
  })

  it('passes resolved model object into delegated sub-agents', async () => {
    const resolvedModel = {
      getResponse: vi.fn(),
      getStreamedResponse: vi.fn()
    }

    runMock.mockResolvedValue({ finalOutput: 'delegated summary' })

    await runOrchestrator({
      task: 'Implement parser changes safely',
      tools: [],
      provider: {
        name: 'openai-compatible',
        model: 'qwen',
        createModel: async () => resolvedModel
      }
    })

    expect(runMock).toHaveBeenCalledTimes(1)
    expect(runMock.mock.calls[0][0].name).toBe('coding-agent')
    expect(runMock.mock.calls[0][0].model).toBe(resolvedModel)
  })
})
