import { Agent, type Model, type Tool } from "@openai/agents";

export function createReviewerAgent(tools: Tool[], model: string | Model): Agent {
  return new Agent({
    name: "reviewer-agent",
    instructions:
      "Review the current workspace code, not a hypothetical result. Start by using search_code to find the most relevant files, then use read_file on a small number of high-signal files. Do not edit files or run commands unless the user explicitly asks. Once you have enough evidence, stop and return a concise review summary with concrete findings or a clear statement that no major issues were found.",
    model,
    tools,
  });
}
