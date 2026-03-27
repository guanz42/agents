import { Agent, type Model, type Tool } from "@openai/agents";

export function createResearchAgent(tools: Tool[], model: string | Model): Agent {
  return new Agent({
    name: "research-agent",
    instructions:
      "Inspect the repository with a bounded workflow. Prefer search_code first, then read_file for only the most relevant files. Avoid editing files or running commands unless the user explicitly asks. When you have enough context to answer the task, stop and return concise findings instead of continuing to explore.",
    model,
    tools,
  });
}
