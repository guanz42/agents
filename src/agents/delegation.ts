import { type Agent, type Model, type Tool, tool } from "@openai/agents";
import { z } from "zod";
import type { ToolDefinition } from "../tools/registry.js";
import { createCodingAgent } from "./coding-agent.js";
import { createResearchAgent } from "./research-agent.js";
import { createReviewerAgent } from "./reviewer-agent.js";

export type AgentRole = "research-agent" | "coding-agent" | "reviewer-agent" | null;

const RESEARCH_KEYWORDS = ["inspect", "analyze", "summarize", "examine", "investigate", "explore"];
const REVIEW_KEYWORDS = ["review", "check", "validate", "verify", "audit"];
const CODING_KEYWORDS = [
  "add",
  "implement",
  "change",
  "fix",
  "update",
  "debug",
  "refactor",
  "write",
];

const permissiveToolParameters = z.object({}).passthrough();

function extractTaskWords(task: string): Set<string> {
  const words = task.match(/[a-z]+/g) ?? [];
  return new Set(words);
}

function containsAnyKeyword(taskWords: Set<string>, keywords: string[]): boolean {
  return keywords.some((keyword) => taskWords.has(keyword));
}

export function adaptToolsForAgentSdk(tools: ToolDefinition[]): Tool[] {
  return tools.map((localTool) =>
    tool({
      name: localTool.name,
      description: localTool.description,
      parameters: localTool.schema ?? permissiveToolParameters,
      async execute(input) {
        return localTool.execute(input);
      },
    }),
  );
}

export function chooseSubAgent(task: string): AgentRole {
  const normalizedTask = task.toLowerCase();
  const taskWords = extractTaskWords(normalizedTask);

  if (containsAnyKeyword(taskWords, REVIEW_KEYWORDS)) {
    return "reviewer-agent";
  }

  if (containsAnyKeyword(taskWords, CODING_KEYWORDS)) {
    return "coding-agent";
  }

  if (containsAnyKeyword(taskWords, RESEARCH_KEYWORDS)) {
    return "research-agent";
  }

  return null;
}

export function createDelegatedAgent(
  role: AgentRole,
  tools: Tool[],
  model: string | Model,
): Agent | null {
  if (role === "research-agent") {
    return createResearchAgent(tools, model);
  }

  if (role === "coding-agent") {
    return createCodingAgent(tools, model);
  }

  if (role === "reviewer-agent") {
    return createReviewerAgent(tools, model);
  }

  return null;
}
