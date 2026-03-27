import { Agent, type Model, type Tool } from '@openai/agents'

export function createReviewerAgent(tools: Tool[], model: string | Model): Agent {
  return new Agent({
    name: 'reviewer-agent',
    instructions: 'Review the proposed result, identify gaps, and return a short validation summary.',
    model,
    tools
  })
}
