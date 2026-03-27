import { Readable } from "node:stream";
import {
  adaptToolsForAgentSdk,
  chooseSubAgent,
  createDelegatedAgent,
} from "../../src/agents/delegation.js";
import { runOrchestrator } from "../../src/agents/orchestrator.js";
import { readFileSchema } from "../../src/tools/read-file.js";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const runMock = vi.hoisted(() => vi.fn());

vi.mock("@openai/agents", () => {
  class MockAgent {
    name: string;
    instructions?: string;
    model?: unknown;
    tools?: unknown[];

    constructor(config: {
      name: string;
      instructions?: string;
      model?: unknown;
      tools?: unknown[];
    }) {
      this.name = config.name;
      this.instructions = config.instructions;
      this.model = config.model;
      this.tools = config.tools;
    }
  }

  return {
    Agent: MockAgent,
    run: runMock,
    tool: ({
      name,
      description,
      parameters,
      execute,
    }: {
      name: string;
      description: string;
      parameters: unknown;
      execute: (input: Record<string, unknown>) => Promise<unknown>;
    }) => ({
      type: "function",
      name,
      description,
      parameters,
      strict: true,
      invoke: execute,
      needsApproval: false,
    }),
  };
});

beforeEach(() => {
  runMock.mockReset();
});

function createStreamedRunResult(finalOutput: unknown, chunks: Array<string | Uint8Array>) {
  return {
    finalOutput,
    completed: Promise.resolve(),
    toTextStream: vi.fn(() => Readable.from(chunks)),
  };
}

describe("chooseSubAgent", () => {
  it("routes repository inspection work to research-agent", () => {
    expect(chooseSubAgent("Inspect the repo structure and summarize it")).toBe("research-agent");
  });

  it("routes implementation work to coding-agent", () => {
    expect(chooseSubAgent("Implement a new parser and add error handling")).toBe("coding-agent");
  });

  it("routes review work to reviewer-agent", () => {
    expect(chooseSubAgent("Review the result and check for regressions")).toBe("reviewer-agent");
  });

  it("routes mixed English-Chinese review prompts to reviewer-agent", () => {
    expect(chooseSubAgent("review当前代码")).toBe("reviewer-agent");
  });

  it("routes common coding verbs to coding-agent", () => {
    expect(chooseSubAgent("Fix and debug the failing tests")).toBe("coding-agent");
    expect(chooseSubAgent("Update the parser implementation")).toBe("coding-agent");
  });

  it("routes examine-style research requests to research-agent", () => {
    expect(chooseSubAgent("Examine the module boundaries")).toBe("research-agent");
  });

  it("keeps coding precedence over research in mixed tasks", () => {
    expect(chooseSubAgent("Analyze the bug and fix it")).toBe("coding-agent");
  });

  it("returns null when task does not match delegation keywords", () => {
    expect(chooseSubAgent("Hello there")).toBeNull();
  });

  it("avoids false positives from partial word matches like address/rewrite", () => {
    expect(chooseSubAgent("The address formatting needs a rewrite.")).toBeNull();
  });
});

describe("createDelegatedAgent", () => {
  const tools = adaptToolsForAgentSdk([]);
  const model = "gpt-4.1";

  it("maps research role to research-agent", () => {
    const agent = createDelegatedAgent("research-agent", tools, model);
    expect(agent?.name).toBe("research-agent");
  });

  it("maps coding role to coding-agent", () => {
    const agent = createDelegatedAgent("coding-agent", tools, model);
    expect(agent?.name).toBe("coding-agent");
  });

  it("maps reviewer role to reviewer-agent", () => {
    const agent = createDelegatedAgent("reviewer-agent", tools, model);
    expect(agent?.name).toBe("reviewer-agent");
  });

  it("returns null when role is null", () => {
    expect(createDelegatedAgent(null, tools, model)).toBeNull();
  });

  it("gives reviewer-agent bounded code review instructions", () => {
    const agent = createDelegatedAgent("reviewer-agent", tools, model);
    expect(agent?.instructions).toContain("Review the current workspace code");
    expect(agent?.instructions).toContain("search_code");
    expect(agent?.instructions).toContain("read_file");
  });
});

describe("adaptToolsForAgentSdk", () => {
  it("passes each tool schema through to the sdk tool definition", () => {
    const [sdkTool] = adaptToolsForAgentSdk([
      {
        name: "read_file",
        description: "Read a file",
        schema: readFileSchema,
        execute: async () => ({ ok: true }),
      },
    ]);

    expect(sdkTool.type).toBe("function");

    if (sdkTool.type !== "function") {
      throw new Error("expected function tool");
    }

    expect(sdkTool.parameters).toBe(readFileSchema);
  });
});

describe("runOrchestrator", () => {
  it("delegates to coding-agent when routing matches coding work", async () => {
    runMock.mockResolvedValue(
      createStreamedRunResult("delegated summary", ["delegated ", "summary"]),
    );

    const result = await runOrchestrator({
      task: "Debug the failing workflow",
      tools: [],
      provider: {
        name: "openai",
        model: "gpt-4.1",
        createModel: async () => ({
          provider: "anthropic",
          model: "claude-3-7",
          status: "planned-extension",
        }),
      },
    });

    expect(result.delegatedAgent).toBe("coding-agent");
    expect(result.summary).toBe("delegated summary");
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock.mock.calls[0][0].name).toBe("coding-agent");
    expect(runMock.mock.calls[0][0].model).toBe("gpt-4.1");
    expect(runMock.mock.calls[0][2]).toEqual({ stream: true });
  });

  it("uses fallback orchestrator model object and stringifies object output", async () => {
    const resolvedModel = {
      getResponse: vi.fn(),
      getStreamedResponse: vi.fn(),
    };
    const createModel = vi.fn(async () => resolvedModel);
    runMock.mockResolvedValue(createStreamedRunResult({ ok: true }, []));

    const result = await runOrchestrator({
      task: "Say hello politely",
      tools: [],
      provider: {
        name: "openai",
        model: "gpt-4.1",
        createModel,
      },
    });

    expect(result.delegatedAgent).toBeNull();
    expect(result.summary).toBe('{"ok":true}');
    expect(createModel).toHaveBeenCalledTimes(1);
    expect(runMock.mock.calls[0][0].name).toBe("orchestrator");
    expect(runMock.mock.calls[0][0].model).toBe(resolvedModel);
  });

  it("passes resolved model object into delegated sub-agents", async () => {
    const resolvedModel = {
      getResponse: vi.fn(),
      getStreamedResponse: vi.fn(),
    };

    runMock.mockResolvedValue(createStreamedRunResult("delegated summary", []));

    await runOrchestrator({
      task: "Implement parser changes safely",
      tools: [],
      provider: {
        name: "openai-compatible",
        model: "qwen",
        createModel: async () => resolvedModel,
      },
    });

    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock.mock.calls[0][0].name).toBe("coding-agent");
    expect(runMock.mock.calls[0][0].model).toBe(resolvedModel);
  });

  it("forwards streamed text deltas before returning the final summary", async () => {
    const onTextDelta = vi.fn(async () => undefined);
    const streamedResult = createStreamedRunResult("final summary", ["part 1", " + part 2"]);
    const resolvedModel = {
      getResponse: vi.fn(),
      getStreamedResponse: vi.fn(),
    };
    runMock.mockResolvedValue(streamedResult);

    const result = await runOrchestrator({
      task: "Summarize the workspace",
      tools: [],
      provider: {
        name: "openai",
        model: "gpt-4.1",
        createModel: async () => resolvedModel,
      },
      onTextDelta,
    });

    expect(streamedResult.toTextStream).toHaveBeenCalledWith({ compatibleWithNodeStreams: true });
    expect(onTextDelta).toHaveBeenNthCalledWith(1, "part 1");
    expect(onTextDelta).toHaveBeenNthCalledWith(2, " + part 2");
    expect(result.summary).toBe("final summary");
  });

  it("normalizes streamed Buffer chunks before forwarding text deltas", async () => {
    const onTextDelta = vi.fn(async () => undefined);
    const streamedResult = createStreamedRunResult("buffer summary", [Buffer.from("buffer chunk")]);
    runMock.mockResolvedValue(streamedResult);

    await runOrchestrator({
      task: "Summarize the workspace",
      tools: [],
      provider: {
        name: "openai",
        model: "gpt-4.1",
        createModel: async () => ({
          getResponse: vi.fn(),
          getStreamedResponse: vi.fn(),
        }),
      },
      onTextDelta,
    });

    expect(onTextDelta).toHaveBeenCalledWith("buffer chunk");
  });

  it("waits for completion before reading the final summary", async () => {
    const completed = vi.fn<() => void>();
    let resolveCompleted = () => undefined;
    const completedPromise = new Promise<void>((resolve) => {
      resolveCompleted = () => {
        completed();
        resolve();
      };
    });
    const stream = Readable.from(["chunk"]);
    const finalOutputHolder: { value: unknown } = { value: undefined };
    const streamedResult = {
      get finalOutput() {
        return finalOutputHolder.value;
      },
      completed: completedPromise,
      toTextStream: vi.fn(() => stream),
    };
    runMock.mockResolvedValue(streamedResult);

    const resultPromise = runOrchestrator({
      task: "Summarize the workspace",
      tools: [],
      provider: {
        name: "openai",
        model: "gpt-4.1",
        createModel: async () => ({
          getResponse: vi.fn(),
          getStreamedResponse: vi.fn(),
        }),
      },
    });

    await Promise.resolve();
    finalOutputHolder.value = "ready after completion";
    resolveCompleted();

    const result = await resultPromise;
    expect(completed).toHaveBeenCalledTimes(1);
    expect(result.summary).toBe("ready after completion");
  });
});
