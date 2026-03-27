import type { ProviderClient, ProviderConfig } from "./types.js";

export function createAnthropicProvider(config: ProviderConfig): ProviderClient {
  return {
    name: "anthropic",
    model: config.model,
    async createModel() {
      return {
        provider: "anthropic",
        model: config.model,
        status: "planned-extension",
      };
    },
  };
}
