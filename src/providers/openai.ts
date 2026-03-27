import { OpenAIProvider, type Model, type ModelResponse, type ModelRequest } from '@openai/agents'
import type { ProviderClient, ProviderConfig } from './types.js'

interface ChatCompletionFunctionCall {
  id: string
  function: {
    name: string
    arguments: string
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isChatCompletionFunctionCall(value: unknown): value is ChatCompletionFunctionCall {
  if (!isObject(value) || typeof value.id !== 'string') {
    return false
  }

  const fn = value.function

  return (
    isObject(fn) &&
    typeof fn.name === 'string' &&
    typeof fn.arguments === 'string'
  )
}

function extractToolCalls(providerData: unknown): ChatCompletionFunctionCall[] {
  if (!isObject(providerData)) {
    return []
  }

  const choices = providerData.choices

  if (!Array.isArray(choices) || choices.length === 0 || !isObject(choices[0])) {
    return []
  }

  const message = choices[0].message

  if (!isObject(message)) {
    return []
  }

  const toolCalls = message.tool_calls

  if (!Array.isArray(toolCalls)) {
    return []
  }

  return toolCalls.filter(isChatCompletionFunctionCall)
}

function hasOnlyEmptyAssistantMessages(response: ModelResponse): boolean {
  return (
    response.output.length > 0 &&
    response.output.every((item) => {
      if (item.type !== 'message' || item.role !== 'assistant') {
        return false
      }

      return item.content.every((contentItem) => contentItem.type === 'output_text' && contentItem.text === '')
    })
  )
}

export function normalizeCompatibleChatCompletionsResponse(response: ModelResponse): ModelResponse {
  const toolCalls = extractToolCalls(response.providerData)

  if (toolCalls.length === 0 || !hasOnlyEmptyAssistantMessages(response)) {
    return response
  }

  return {
    ...response,
    output: toolCalls.map((toolCall) => ({
      id: response.responseId,
      type: 'function_call' as const,
      arguments: toolCall.function.arguments,
      name: toolCall.function.name,
      callId: toolCall.id,
      status: 'completed' as const,
      providerData: {}
    }))
  }
}

function wrapCompatibleChatCompletionsModel(model: Model): Model {
  return {
    async getResponse(request: ModelRequest): Promise<ModelResponse> {
      const response = await model.getResponse(request)
      return normalizeCompatibleChatCompletionsResponse(response)
    },
    getStreamedResponse(request) {
      return model.getStreamedResponse(request)
    }
  }
}

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

      return wrapCompatibleChatCompletionsModel(await provider.getModel(config.model))
    }
  }
}
