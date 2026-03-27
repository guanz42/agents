import { Usage } from "@openai/agents";
import { beforeEach, describe, expect, it, vi } from "bun:test";

const openAIProviderOptionsMock = vi.fn();
const getModelMock = vi.fn();

vi.mock("@openai/agents", () => {
  class MockOpenAIProvider {
    constructor(options: unknown) {
      openAIProviderOptionsMock(options);
    }

    async getModel(model: string) {
      return getModelMock(model);
    }
  }

  class MockUsage {
    requests = 0;
    inputTokens = 0;
    outputTokens = 0;
    totalTokens = 0;
    inputTokensDetails = {};
    outputTokensDetails = {};

    constructor(input: Record<string, unknown>) {
      Object.assign(this, input);
    }

    add() {
      return this;
    }
  }

  return {
    OpenAIProvider: MockOpenAIProvider,
    Usage: MockUsage,
  };
});

import { createProvider } from "../../src/providers/factory.js";
import { normalizeCompatibleChatCompletionsResponse } from "../../src/providers/openai.js";
import type { ProviderConfig } from "../../src/providers/types.js";

function createResponseModel(
  overrides: Partial<{ getResponse: unknown; getStreamedResponse: unknown }> = {},
) {
  return {
    getResponse:
      typeof overrides.getResponse === "function"
        ? overrides.getResponse
        : vi.fn(async () => ({ output: [], providerData: {}, responseId: "resp_1" })),
    getStreamedResponse:
      typeof overrides.getStreamedResponse === "function"
        ? overrides.getStreamedResponse
        : vi.fn(() => ({
            async *[Symbol.asyncIterator]() {
              yield { type: "response.output_text.delta", delta: "ok" };
            },
          })),
  };
}

function createUnsupportedResponsesError(status: 400 | 404 | 405 | 422 | 501, message: string) {
  return {
    status,
    message,
    error: {
      message,
    },
  };
}

async function collectStream(stream: AsyncIterable<unknown>): Promise<unknown[]> {
  const items: unknown[] = [];

  for await (const item of stream) {
    items.push(item);
  }

  return items;
}

beforeEach(() => {
  openAIProviderOptionsMock.mockReset();
  getModelMock.mockReset();
});

describe("createProvider", () => {
  it("returns an OpenAI provider module", () => {
    const provider = createProvider({
      provider: "openai",
      model: "gpt-4.1",
      apiKey: "test-key",
    });

    expect(provider.name).toBe("openai");
    expect(provider.model).toBe("gpt-4.1");
  });

  it("prefers the responses API for the native OpenAI provider", async () => {
    const model = createResponseModel();
    getModelMock.mockResolvedValue(model);

    const provider = createProvider({
      provider: "openai",
      model: "gpt-4.1",
      apiKey: "test-key",
    });

    await expect(provider.createModel()).resolves.toBe(model);
    expect(openAIProviderOptionsMock).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: undefined,
      useResponses: true,
    });
  });

  it("defaults openai-compatible providers to responses using the configured API root", async () => {
    const responsesModel = createResponseModel();
    getModelMock.mockResolvedValue(responsesModel);

    const provider = createProvider({
      provider: "openai-compatible",
      model: "llama-3.3-70b",
      apiKey: "compat-key",
      baseUrl: "https://openrouter.ai/api/v1",
    });

    await expect(provider.createModel()).resolves.toBeTruthy();
    expect(openAIProviderOptionsMock).toHaveBeenCalledTimes(1);
    expect(openAIProviderOptionsMock).toHaveBeenCalledWith({
      apiKey: "compat-key",
      baseURL: "https://openrouter.ai/api/v1",
      useResponses: true,
    });
  });

  it("falls back to chat completions after an unsupported responses error and caches the choice", async () => {
    const responsesModel = createResponseModel({
      getResponse: vi.fn(async () => {
        throw createUnsupportedResponsesError(404, "POST /responses not found");
      }),
    });
    const chatModel = createResponseModel({
      getResponse: vi.fn(async () => ({
        output: [
          {
            id: "resp_123",
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "" }],
            status: "completed",
          },
        ],
        providerData: {
          choices: [
            {
              message: {
                content: "",
                tool_calls: [
                  {
                    id: "call_1",
                    function: {
                      name: "search_code",
                      arguments: '{"query":"import"}',
                    },
                  },
                ],
              },
            },
          ],
        },
        responseId: "resp_123",
      })),
    });

    getModelMock.mockResolvedValueOnce(responsesModel).mockResolvedValueOnce(chatModel);

    const provider = createProvider({
      provider: "openai-compatible",
      model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
      apiKey: "compat-key",
      baseUrl: "https://api.together.xyz/v1",
    });
    const model = await provider.createModel();

    if (!("getResponse" in model)) {
      throw new Error("expected runtime model methods");
    }

    const firstResponse = await model.getResponse({} as never);
    const secondResponse = await model.getResponse({} as never);

    expect(firstResponse.output).toEqual([
      {
        id: "resp_123",
        type: "function_call",
        arguments: '{"query":"import"}',
        name: "search_code",
        callId: "call_1",
        status: "completed",
        providerData: {},
      },
    ]);
    expect(secondResponse).toBeDefined();

    expect(openAIProviderOptionsMock).toHaveBeenNthCalledWith(1, {
      apiKey: "compat-key",
      baseURL: "https://api.together.xyz/v1",
      useResponses: true,
    });
    expect(openAIProviderOptionsMock).toHaveBeenNthCalledWith(2, {
      apiKey: "compat-key",
      baseURL: "https://api.together.xyz/v1",
      useResponses: false,
    });
    expect(openAIProviderOptionsMock).toHaveBeenCalledTimes(2);
  });

  it("reuses the fallback for streamed responses after capability is downgraded", async () => {
    const responsesModel = createResponseModel({
      getStreamedResponse: vi.fn(() => {
        throw createUnsupportedResponsesError(405, "responses endpoint unsupported");
      }),
    });
    const chatStream = {
      async *[Symbol.asyncIterator]() {
        yield { type: "response.output_text.delta", delta: "fallback" };
      },
    };
    const chatModel = createResponseModel({
      getStreamedResponse: vi.fn(() => chatStream),
    });

    getModelMock.mockResolvedValueOnce(responsesModel).mockResolvedValueOnce(chatModel);

    const provider = createProvider({
      provider: "openai-compatible",
      model: "llama-3.1",
      apiKey: "compat-key",
      baseUrl: "https://example.com/v1",
    });
    const model = await provider.createModel();

    if (!("getStreamedResponse" in model)) {
      throw new Error("expected streamed model method");
    }

    const firstItems = await collectStream(model.getStreamedResponse({} as never));
    const secondItems = await collectStream(model.getStreamedResponse({} as never));

    expect(firstItems).toEqual([{ type: "response.output_text.delta", delta: "fallback" }]);
    expect(secondItems).toEqual([{ type: "response.output_text.delta", delta: "fallback" }]);
    expect(openAIProviderOptionsMock).toHaveBeenCalledTimes(2);
  });

  it("falls back when a streamed responses error is raised during iteration before any items are yielded", async () => {
    const responsesModel = createResponseModel({
      getStreamedResponse: vi.fn(() => ({
        [Symbol.asyncIterator]() {
          return {
            async next() {
              throw createUnsupportedResponsesError(404, "POST /responses not found");
            },
          };
        },
      })),
    });
    const chatStream = {
      async *[Symbol.asyncIterator]() {
        yield { type: "response.output_text.delta", delta: "fallback after iteration failure" };
      },
    };
    const chatModel = createResponseModel({
      getStreamedResponse: vi.fn(() => chatStream),
    });

    getModelMock.mockResolvedValueOnce(responsesModel).mockResolvedValueOnce(chatModel);

    const provider = createProvider({
      provider: "openai-compatible",
      model: "llama-3.1",
      apiKey: "compat-key",
      baseUrl: "https://example.com/v1",
    });
    const model = await provider.createModel();

    if (!("getStreamedResponse" in model)) {
      throw new Error("expected streamed model method");
    }

    const firstItems = await collectStream(model.getStreamedResponse({} as never));
    const secondItems = await collectStream(model.getStreamedResponse({} as never));

    expect(firstItems).toEqual([
      { type: "response.output_text.delta", delta: "fallback after iteration failure" },
    ]);
    expect(secondItems).toEqual([
      { type: "response.output_text.delta", delta: "fallback after iteration failure" },
    ]);
    expect(openAIProviderOptionsMock).toHaveBeenCalledTimes(2);
  });

  it("does not fall back on unrelated request failures", async () => {
    const failure = { status: 429, message: "rate limited" };
    const responsesModel = createResponseModel({
      getResponse: vi.fn(async () => {
        throw failure;
      }),
    });

    getModelMock.mockResolvedValue(responsesModel);

    const provider = createProvider({
      provider: "openai-compatible",
      model: "llama-3.1",
      apiKey: "compat-key",
      baseUrl: "https://example.com/v1",
    });
    const model = await provider.createModel();

    if (!("getResponse" in model)) {
      throw new Error("expected runtime model methods");
    }

    await expect(model.getResponse({} as never)).rejects.toBe(failure);
    expect(openAIProviderOptionsMock).toHaveBeenCalledTimes(1);
  });

  it("rejects openai-compatible providers that do not define a baseUrl", async () => {
    const provider = createProvider({
      provider: "openai-compatible",
      model: "gpt-4.1-mini",
      apiKey: "compat-key",
    });

    await expect(provider.createModel()).rejects.toThrow(
      "OpenAI-compatible provider requires baseUrl",
    );
  });

  it("normalizes chat completions tool calls when the provider returns empty assistant content", () => {
    const response = normalizeCompatibleChatCompletionsResponse({
      usage: new Usage({
        requests: 1,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      }),
      responseId: "resp_123",
      providerData: {
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "call_1",
                  function: {
                    name: "search_code",
                    arguments: '{"query":"import"}',
                  },
                },
              ],
            },
          },
        ],
      },
      output: [
        {
          id: "resp_123",
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: "",
            },
          ],
          status: "completed",
        },
      ],
    });

    expect(response.output).toEqual([
      {
        id: "resp_123",
        type: "function_call",
        arguments: '{"query":"import"}',
        name: "search_code",
        callId: "call_1",
        status: "completed",
        providerData: {},
      },
    ]);
  });

  it("rejects unsupported provider values explicitly", () => {
    const invalidConfig = {
      provider: "not-real",
      model: "gpt-4.1",
    } as unknown as ProviderConfig;

    expect(() => createProvider(invalidConfig)).toThrow("Unsupported provider: not-real");
  });
});
