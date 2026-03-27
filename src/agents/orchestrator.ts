import { Agent, type Model, run } from '@openai/agents'
import type { ProviderClient } from '../providers/types.js'
import type { ToolDefinition } from '../tools/registry.js'
import { adaptToolsForAgentSdk, chooseSubAgent, createDelegatedAgent } from './delegation.js'

export interface RunOrchestratorInput {
  task: string
  tools: ToolDefinition[]
  provider: ProviderClient
}

export interface OrchestratorResult {
  delegatedAgent: 'research-agent' | 'coding-agent' | 'reviewer-agent' | null
  summary: string
}

function isPlannedAnthropicModel(value: unknown): value is { provider: 'anthropic'; status: 'planned-extension' } {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  return Reflect.get(value, 'provider') === 'anthropic' && Reflect.get(value, 'status') === 'planned-extension'
}

async function resolveModel(provider: ProviderClient): Promise<string | Model> {
  const createdModel = await provider.createModel()
  return isPlannedAnthropicModel(createdModel) ? provider.model : createdModel
}

export async function runOrchestrator(input: RunOrchestratorInput): Promise<OrchestratorResult> {
  const delegatedAgent = chooseSubAgent(input.task)
  const agentTools = adaptToolsForAgentSdk(input.tools)
  const model = await resolveModel(input.provider)

  const activeAgent =
    createDelegatedAgent(delegatedAgent, agentTools, model) ??
    new Agent({
      name: 'orchestrator',
      instructions: 'Route work carefully, use tools deliberately, and keep the response concise.',
      model,
      tools: agentTools
    })

  const result = await run(activeAgent, input.task)

  return {
    delegatedAgent,
    summary:
      typeof result.finalOutput === 'string'
        ? result.finalOutput
        : result.finalOutput === undefined
          ? ''
          : JSON.stringify(result.finalOutput)
  }
}
