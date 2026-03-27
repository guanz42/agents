import { Agent, type Model, type Tool } from '@openai/agents'

export function createCodingAgent(tools: Tool[], model: string | Model): Agent {
  return new Agent({
    name: 'coding-agent',
    instructions: 'Make focused code changes inside the provided scope and summarize the edits clearly.',
    model,
    tools
  })
}
