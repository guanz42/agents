import { OpenAIChatCompletionsModel, OpenAIResponsesModel } from '@openai/agents'
import { describe, expect, it } from 'vitest'
import { createProvider } from '../../src/providers/factory.js'
import type { ProviderConfig } from '../../src/providers/types.js'

describe('createProvider', () => {
  it('returns an OpenAI provider module', () => {
    const provider = createProvider({
      provider: 'openai',
      model: 'gpt-4.1',
      apiKey: 'test-key'
    })

    expect(provider.name).toBe('openai')
    expect(provider.model).toBe('gpt-4.1')
  })

  it('exposes createModel and resolves an OpenAI responses model', async () => {
    const provider = createProvider({
      provider: 'openai',
      model: 'gpt-4.1',
      apiKey: 'test-key'
    })

    expect(typeof provider.createModel).toBe('function')

    const model = await provider.createModel()
    expect(model).toBeTypeOf('object')
    expect(model).toBeTruthy()
    expect(model).toBeInstanceOf(OpenAIResponsesModel)
  })

  it('returns an OpenAI-compatible provider module', async () => {
    const provider = createProvider({
      provider: 'openai-compatible',
      model: 'gpt-4.1-mini',
      apiKey: 'compat-key',
      baseUrl: 'https://example.com/v1'
    })

    expect(provider.name).toBe('openai-compatible')
    expect(typeof provider.createModel).toBe('function')

    const model = await provider.createModel()
    expect(model).toBeTypeOf('object')
    expect(model).toBeTruthy()
    expect(model).toBeInstanceOf(OpenAIChatCompletionsModel)
  })

  it('rejects unsupported provider values explicitly', () => {
    const invalidConfig = {
      provider: 'not-real',
      model: 'gpt-4.1'
    } as unknown as ProviderConfig

    expect(() => createProvider(invalidConfig)).toThrow('Unsupported provider: not-real')
  })
})
