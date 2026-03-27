import { OpenAIProvider } from '@openai/agents'
import type { ProviderClient, ProviderConfig } from './types.js'

export function createOpenAIProvider(config: ProviderConfig): ProviderClient {
  return {
    name: 'openai',
    model: config.model,
    async createModel() {
      const provider = new OpenAIProvider({
        apiKey: config.apiKey,
        useResponses: true
      })

      return provider.getModel(config.model)
    }
  }
}

export function createOpenAICompatibleProvider(config: ProviderConfig): ProviderClient {
  return {
    name: 'openai-compatible',
    model: config.model,
    async createModel() {
      if (!config.baseUrl) {
        throw new Error('OpenAI-compatible provider requires baseUrl')
      }

      const provider = new OpenAIProvider({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        useResponses: false
      })

      return provider.getModel(config.model)
    }
  }
}
