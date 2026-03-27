import type { Model } from '@openai/agents'

export type ProviderName = 'openai' | 'anthropic' | 'openai-compatible'

export interface ProviderConfig {
  provider: ProviderName
  model: string
  apiKey?: string
  baseUrl?: string
}

export interface AnthropicPlannedModel {
  provider: 'anthropic'
  model: string
  status: 'planned-extension'
}

export type ProviderModel = Model | AnthropicPlannedModel

export interface ProviderClient {
  name: ProviderName
  model: string
  createModel(): Promise<ProviderModel>
}
