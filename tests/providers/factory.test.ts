import { OpenAIResponsesModel, Usage } from '@openai/agents'
import { describe, expect, it } from 'vitest'
import { createProvider } from '../../src/providers/factory.js'
import { normalizeCompatibleChatCompletionsResponse } from '../../src/providers/openai.js'
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

    if (!('getResponse' in model) || !('getStreamedResponse' in model)) {
      throw new Error('expected runtime model methods')
    }

    expect(typeof model.getResponse).toBe('function')
    expect(typeof model.getStreamedResponse).toBe('function')
  })

  it('normalizes chat completions tool calls when the provider returns empty assistant content', () => {
    const response = normalizeCompatibleChatCompletionsResponse({
      usage: new Usage({
        requests: 1,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      }),
      responseId: 'resp_123',
      providerData: {
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'call_1',
                  function: {
                    name: 'search_code',
                    arguments: '{"query":"import"}'
                  }
                }
              ]
            }
          }
        ]
      },
      output: [
        {
          id: 'resp_123',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: ''
            }
          ],
          status: 'completed'
        }
      ]
    })

    expect(response.output).toEqual([
      {
        id: 'resp_123',
        type: 'function_call',
        arguments: '{"query":"import"}',
        name: 'search_code',
        callId: 'call_1',
        status: 'completed',
        providerData: {}
      }
    ])
  })

  it('rejects unsupported provider values explicitly', () => {
    const invalidConfig = {
      provider: 'not-real',
      model: 'gpt-4.1'
    } as unknown as ProviderConfig

    expect(() => createProvider(invalidConfig)).toThrow('Unsupported provider: not-real')
  })
})
