import { Agent, type Model, run } from "@openai/agents";
import type { ProviderClient } from "../providers/types.js";
import type { ToolDefinition } from "../tools/registry.js";
import { adaptToolsForAgentSdk, chooseSubAgent, createDelegatedAgent } from "./delegation.js";

export interface RunOrchestratorInput {
  task: string;
  tools: ToolDefinition[];
  provider: ProviderClient;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  onTextDelta?: (chunk: string) => void | Promise<void>;
}

export interface OrchestratorResult {
  delegatedAgent: "research-agent" | "coding-agent" | "reviewer-agent" | null;
  summary: string;
}

function isPlannedAnthropicModel(
  value: unknown,
): value is { provider: "anthropic"; status: "planned-extension" } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    Reflect.get(value, "provider") === "anthropic" &&
    Reflect.get(value, "status") === "planned-extension"
  );
}

async function resolveModel(provider: ProviderClient): Promise<string | Model> {
  const createdModel = await provider.createModel();
  return isPlannedAnthropicModel(createdModel) ? provider.model : createdModel;
}

function stringifyFinalOutput(finalOutput: unknown): string {
  if (typeof finalOutput === "string") {
    return finalOutput;
  }

  return finalOutput === undefined ? "" : JSON.stringify(finalOutput);
}

function normalizeTextChunk(chunk: unknown): string {
  if (typeof chunk === "string") {
    return chunk;
  }

  return chunk instanceof Uint8Array ? Buffer.from(chunk).toString("utf8") : String(chunk);
}

export async function runOrchestrator(input: RunOrchestratorInput): Promise<OrchestratorResult> {
  const delegatedAgent = chooseSubAgent(input.task);
  const agentTools = adaptToolsForAgentSdk(input.tools);
  const model = await resolveModel(input.provider);

  let instructions = "Route work carefully, use tools deliberately, and keep the response concise.";

  if (input.conversationHistory && input.conversationHistory.length > 0) {
    const historyContext = input.conversationHistory
      .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
      .join("\n");
    instructions += ` You are in an ongoing multi-turn conversation. Context from previous turns:\n\n${historyContext}`;
  }

  const activeAgent =
    createDelegatedAgent(delegatedAgent, agentTools, model) ??
    new Agent({
      name: "orchestrator",
      instructions,
      model,
      tools: agentTools,
    });

  const result = await run(activeAgent, input.task, { stream: true });

  const textStream = result.toTextStream({ compatibleWithNodeStreams: true });

  for await (const chunk of textStream) {
    await input.onTextDelta?.(normalizeTextChunk(chunk));
  }

  await result.completed;

  return {
    delegatedAgent,
    summary: stringifyFinalOutput(result.finalOutput),
  };
}
