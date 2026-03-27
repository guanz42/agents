import { createAnthropicProvider } from "./anthropic.js";
import { createOpenAICompatibleProvider, createOpenAIProvider } from "./openai.js";
import type { ProviderClient, ProviderConfig } from "./types.js";

export function createProvider(config: ProviderConfig): ProviderClient {
  switch (config.provider) {
    case "openai":
      return createOpenAIProvider(config);
    case "anthropic":
      return createAnthropicProvider(config);
    case "openai-compatible":
      return createOpenAICompatibleProvider(config);
    default:
      throw new Error(`Unsupported provider: ${String(config.provider)}`);
  }
}
