import { Agent, type Model, type Tool } from '@openai/agents'

export function createResearchAgent(tools: Tool[], model: string | Model): Agent {
  return new Agent({
    name: 'research-agent',
    instructions: 'Inspect the repository, gather bounded context, and return concise findings only.',
    model,
    tools
  })
}
