import { OpenAIProvider, type Model, type ModelRequest, type ModelResponse } from "@openai/agents";
import type { ProviderClient, ProviderConfig } from "./types.js";

type CompatibleApiMode = "unknown" | "responses" | "chat-completions";
type StreamResponse = ReturnType<Model["getStreamedResponse"]>;
type StreamItem = StreamResponse extends AsyncIterable<infer T> ? T : never;

interface ChatCompletionFunctionCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

interface ResponsesUnsupportedErrorShape {
  status?: unknown;
  message?: unknown;
  error?: {
    message?: unknown;
    code?: unknown;
    type?: unknown;
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isChatCompletionFunctionCall(value: unknown): value is ChatCompletionFunctionCall {
  if (!isObject(value) || typeof value.id !== "string") {
    return false;
  }

  const fn = value.function;

  return isObject(fn) && typeof fn.name === "string" && typeof fn.arguments === "string";
}

function extractToolCalls(providerData: unknown): ChatCompletionFunctionCall[] {
  if (!isObject(providerData)) {
    return [];
  }

  const choices = providerData.choices;

  if (!Array.isArray(choices) || choices.length === 0 || !isObject(choices[0])) {
    return [];
  }

  const message = choices[0].message;

  if (!isObject(message)) {
    return [];
  }

  const toolCalls = message.tool_calls;

  if (!Array.isArray(toolCalls)) {
    return [];
  }

  return toolCalls.filter(isChatCompletionFunctionCall);
}

function hasOnlyEmptyAssistantMessages(response: ModelResponse): boolean {
  return (
    response.output.length > 0 &&
    response.output.every((item) => {
      if (item.type !== "message" || item.role !== "assistant") {
        return false;
      }

      return item.content.every(
        (contentItem) => contentItem.type === "output_text" && contentItem.text === "",
      );
    })
  );
}

export function normalizeCompatibleChatCompletionsResponse(response: ModelResponse): ModelResponse {
  const toolCalls = extractToolCalls(response.providerData);

  if (toolCalls.length === 0 || !hasOnlyEmptyAssistantMessages(response)) {
    return response;
  }

  return {
    ...response,
    output: toolCalls.map((toolCall) => ({
      id: response.responseId,
      type: "function_call" as const,
      arguments: toolCall.function.arguments,
      name: toolCall.function.name,
      callId: toolCall.id,
      status: "completed" as const,
      providerData: {},
    })),
  };
}

function wrapCompatibleChatCompletionsModel(model: Model): Model {
  return {
    async getResponse(request: ModelRequest): Promise<ModelResponse> {
      const response = await model.getResponse(request);
      return normalizeCompatibleChatCompletionsResponse(response);
    },
    getStreamedResponse(request) {
      return model.getStreamedResponse(request);
    },
  };
}

function getErrorStatus(error: unknown): number | null {
  if (!isObject(error)) {
    return null;
  }

  return typeof error.status === "number" ? error.status : null;
}

function collectErrorText(error: unknown): string {
  if (!isObject(error)) {
    return "";
  }

  const parts: string[] = [];
  const errorShape = error as ResponsesUnsupportedErrorShape;

  if (typeof errorShape.message === "string") {
    parts.push(errorShape.message);
  }

  if (isObject(errorShape.error)) {
    if (typeof errorShape.error.message === "string") {
      parts.push(errorShape.error.message);
    }

    if (typeof errorShape.error.code === "string") {
      parts.push(errorShape.error.code);
    }

    if (typeof errorShape.error.type === "string") {
      parts.push(errorShape.error.type);
    }
  }

  return parts.join(" ").toLowerCase();
}

function isResponsesUnsupportedError(error: unknown): boolean {
  const status = getErrorStatus(error);

  if (status === 404 || status === 405 || status === 501) {
    return true;
  }

  if (status !== 400 && status !== 422) {
    return false;
  }

  const message = collectErrorText(error);

  if (message.length === 0) {
    return false;
  }

  const referencesResponses = /responses/.test(message);
  const referencesMissingEndpoint =
    /not found|unknown|unsupported|does not exist|unrecognized|no route|invalid url|invalid endpoint|unknown path/.test(
      message,
    );

  return referencesResponses && referencesMissingEndpoint;
}

async function createProviderModel(config: ProviderConfig, useResponses: boolean): Promise<Model> {
  const provider = new OpenAIProvider({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    useResponses,
  });

  const model = await provider.getModel(config.model);

  return useResponses ? model : wrapCompatibleChatCompletionsModel(model);
}

async function createOpenAICompatibleModel(config: ProviderConfig): Promise<Model> {
  if (!config.baseUrl) {
    throw new Error("OpenAI-compatible provider requires baseUrl");
  }

  const responsesModel = await createProviderModel(config, true);
  let apiMode: CompatibleApiMode = "unknown";
  let chatCompletionsModelPromise: Promise<Model> | null = null;

  async function getChatCompletionsModel(): Promise<Model> {
    chatCompletionsModelPromise ??= createProviderModel(config, false);
    return chatCompletionsModelPromise;
  }

  async function runWithFallback<T>(operation: (model: Model) => Promise<T> | T): Promise<T> {
    if (apiMode === "chat-completions") {
      return Promise.resolve(operation(await getChatCompletionsModel()));
    }

    try {
      const result = await Promise.resolve(operation(responsesModel));
      apiMode = "responses";
      return result;
    } catch (error) {
      if (!isResponsesUnsupportedError(error)) {
        throw error;
      }

      apiMode = "chat-completions";
      return Promise.resolve(operation(await getChatCompletionsModel()));
    }
  }

  async function* streamWithFallback(
    request: ModelRequest,
  ): AsyncGenerator<StreamItem, void, undefined> {
    if (apiMode === "chat-completions") {
      const fallbackStream = (await getChatCompletionsModel()).getStreamedResponse(request);

      for await (const item of fallbackStream) {
        yield item;
      }

      return;
    }

    let responsesStream: StreamResponse;

    try {
      responsesStream = responsesModel.getStreamedResponse(request);
    } catch (error) {
      if (!isResponsesUnsupportedError(error)) {
        throw error;
      }

      apiMode = "chat-completions";

      const fallbackStream = (await getChatCompletionsModel()).getStreamedResponse(request);

      for await (const item of fallbackStream) {
        yield item;
      }

      return;
    }

    let yieldedAnyItems = false;

    try {
      for await (const item of responsesStream) {
        yieldedAnyItems = true;
        yield item;
      }

      apiMode = "responses";
    } catch (error) {
      if (yieldedAnyItems || !isResponsesUnsupportedError(error)) {
        throw error;
      }

      apiMode = "chat-completions";

      const fallbackStream = (await getChatCompletionsModel()).getStreamedResponse(request);

      for await (const item of fallbackStream) {
        yield item;
      }
    }
  }

  return {
    async getResponse(request: ModelRequest): Promise<ModelResponse> {
      return runWithFallback((model) => model.getResponse(request));
    },
    getStreamedResponse(request) {
      return {
        async *[Symbol.asyncIterator]() {
          for await (const item of streamWithFallback(request)) {
            yield item;
          }
        },
      };
    },
  };
}

export function createOpenAIProvider(config: ProviderConfig): ProviderClient {
  return {
    name: "openai",
    model: config.model,
    async createModel() {
      return createProviderModel(config, true);
    },
  };
}

export function createOpenAICompatibleProvider(config: ProviderConfig): ProviderClient {
  return {
    name: "openai-compatible",
    model: config.model,
    async createModel() {
      return createOpenAICompatibleModel(config);
    },
  };
}
