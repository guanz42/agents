# Coding Agent Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript/Node.js CLI coding-agent demo that teaches agent orchestration, tool calling, sub-agent delegation, session logging, and provider abstraction using an Agent SDK.

**Architecture:** The project is a local CLI app with a thin command layer, an application bootstrapper, an orchestrator agent, three narrowly scoped sub-agents, a typed tool registry, session persistence, and a provider interface with OpenAI implemented first. The implementation should keep the Agent SDK visible in the agent layer while isolating file IO, shell execution, provider setup, and session logging behind small focused modules.

**Tech Stack:** TypeScript, Node.js, pnpm, OpenAI Agents SDK, Commander, Zod, execa, Vitest, JSON session files

---

## Planned File Map

### Root configuration

- Create: `package.json` — scripts, dependencies, package metadata
- Create: `tsconfig.json` — TypeScript compiler options
- Create: `.gitignore` — ignore `node_modules`, build output, sessions, env files
- Create: `.env.example` — provider configuration examples
- Create: `vitest.config.ts` — test configuration
- Create: `README.md` — local setup and demo commands

### Source layout

- Create: `src/index.ts` — process entry point
- Create: `src/cli/program.ts` — commander program and command registration
- Create: `src/cli/renderers.ts` — consistent CLI output helpers
- Create: `src/app/bootstrap.ts` — dependency wiring and runtime boot
- Create: `src/app/config.ts` — env/config normalization
- Create: `src/agents/orchestrator.ts` — main agent construction and loop wiring
- Create: `src/agents/research-agent.ts` — research-agent definition
- Create: `src/agents/coding-agent.ts` — coding-agent definition
- Create: `src/agents/reviewer-agent.ts` — reviewer-agent definition
- Create: `src/agents/delegation.ts` — sub-agent dispatch helpers
- Create: `src/tools/registry.ts` — tool registration and lookup
- Create: `src/tools/read-file.ts` — file reading tool
- Create: `src/tools/write-file.ts` — file writing tool
- Create: `src/tools/search-code.ts` — code search tool
- Create: `src/tools/run-command.ts` — shell command tool
- Create: `src/providers/types.ts` — provider contracts
- Create: `src/providers/openai.ts` — OpenAI provider implementation
- Create: `src/providers/anthropic.ts` — placeholder adapter stub behind same interface, intentionally not production-ready in v1
- Create: `src/providers/factory.ts` — provider selection logic
- Create: `src/session/store.ts` — JSON session persistence
- Create: `src/session/types.ts` — session event types
- Create: `src/session/format.ts` — session summary/read model helpers
- Create: `src/memory/context.ts` — session-scoped context assembly

### Tests and fixtures

- Create: `tests/config.test.ts`
- Create: `tests/providers/factory.test.ts`
- Create: `tests/tools/registry.test.ts`
- Create: `tests/tools/read-file.test.ts`
- Create: `tests/tools/write-file.test.ts`
- Create: `tests/tools/search-code.test.ts`
- Create: `tests/tools/run-command.test.ts`
- Create: `tests/session/store.test.ts`
- Create: `tests/agents/delegation.test.ts`
- Create: `tests/cli/chat-command.test.ts`
- Create: `tests/cli/run-command.test.ts`
- Create: `tests/cli/resume-command.test.ts`
- Create: `tests/cli/history-command.test.ts`
- Create: `tests/fixtures/sample-repo/README.md`
- Create: `tests/fixtures/sample-repo/src/hello.ts`

### Runtime output

- Create directory: `sessions/` — persisted session JSON files

## Implementation Notes Before Starting

- Keep v1 local-only and inspectable.
- Do not add web UI, vector memory, sandboxing, or remote services.
- Do not hide all orchestration inside a generic framework wrapper; the teaching goal depends on readable runtime code.
- Use the OpenAI-backed path as the default runnable path.
- Keep Anthropic behind the provider interface, but do not force full parity in the first milestone.

### Task 1: Scaffold the TypeScript CLI workspace

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `vitest.config.ts`
- Create: `README.md`

- [ ] **Step 1: Write the failing setup check as a smoke test**

```ts
// tests/config.test.ts
import { describe, expect, it } from "vitest";

describe("workspace scaffold", () => {
  it("exposes a test script in package metadata", async () => {
    const pkg = await import("../package.json", { with: { type: "json" } });
    expect(pkg.default.scripts.test).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to confirm the repository is not scaffolded yet**

Run: `pnpm vitest run tests/config.test.ts`
Expected: FAIL because `package.json` and scripts are not defined yet.

- [ ] **Step 3: Create the base workspace files with minimal runnable scripts**

```json
// package.json
{
  "name": "coding-agent-demo",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "agent": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@openai/agents": "^0.0.10",
    "commander": "^13.1.0",
    "execa": "^9.5.2",
    "openai": "^4.89.0",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "tsx": "^4.19.3",
    "typescript": "^5.8.2",
    "vitest": "^3.0.8"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

```gitignore
# .gitignore
node_modules
dist
.env
sessions/*.json
coverage
```

```env
# .env.example
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
AGENT_PROVIDER=openai
AGENT_MODEL=gpt-4.1
AGENT_SESSION_DIR=./sessions
```

- [ ] **Step 4: Re-run the scaffold test**

Run: `pnpm vitest run tests/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the scaffold**

```bash
git add package.json tsconfig.json .gitignore .env.example vitest.config.ts README.md tests/config.test.ts
git commit -m "chore: scaffold coding agent demo workspace"
```

### Task 2: Add typed configuration and provider contracts

**Files:**

- Create: `src/app/config.ts`
- Create: `src/providers/types.ts`
- Create: `src/providers/factory.ts`
- Test: `tests/config.test.ts`
- Test: `tests/providers/factory.test.ts`

- [ ] **Step 1: Write failing tests for config normalization and provider selection**

```ts
// tests/providers/factory.test.ts
import { describe, expect, it } from "vitest";
import { createProvider } from "../../src/providers/factory.js";

describe("createProvider", () => {
  it("returns the openai provider for the default config", () => {
    const provider = createProvider({ provider: "openai", model: "gpt-4.1" });
    expect(provider.name).toBe("openai");
  });
});
```

```ts
// tests/config.test.ts
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/app/config.js";

describe("loadConfig", () => {
  it("normalizes sessionDir and provider defaults", () => {
    const config = loadConfig({});
    expect(config.provider).toBe("openai");
    expect(config.sessionDir).toContain("sessions");
  });
});
```

- [ ] **Step 2: Run the two tests to verify they fail**

Run: `pnpm vitest run tests/config.test.ts tests/providers/factory.test.ts`
Expected: FAIL because config and provider modules do not exist yet.

- [ ] **Step 3: Implement the minimal config and provider interfaces**

```ts
// src/providers/types.ts
export type ProviderName = "openai" | "anthropic";

export interface ProviderConfig {
  provider: ProviderName;
  model: string;
  apiKey?: string;
}

export interface ProviderClient {
  name: ProviderName;
  model: string;
  createModel(): unknown;
}
```

```ts
// src/app/config.ts
import path from "node:path";
import { ProviderName } from "../providers/types.js";

export interface AppConfig {
  provider: ProviderName;
  model: string;
  sessionDir: string;
}

export function loadConfig(input: Partial<AppConfig>): AppConfig {
  return {
    provider: input.provider ?? "openai",
    model: input.model ?? "gpt-4.1",
    sessionDir: input.sessionDir ?? path.resolve(process.cwd(), "sessions"),
  };
}
```

```ts
// src/providers/factory.ts
import type { ProviderClient, ProviderConfig } from "./types.js";

export function createProvider(config: ProviderConfig): ProviderClient {
  return {
    name: config.provider,
    model: config.model,
    createModel: () => ({ provider: config.provider, model: config.model }),
  };
}
```

- [ ] **Step 4: Re-run the config and provider tests**

Run: `pnpm vitest run tests/config.test.ts tests/providers/factory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the config layer**

```bash
git add src/app/config.ts src/providers/types.ts src/providers/factory.ts tests/config.test.ts tests/providers/factory.test.ts
git commit -m "feat: add typed config and provider contracts"
```

### Task 3: Build the JSON session store and read model helpers

**Files:**

- Create: `src/session/types.ts`
- Create: `src/session/store.ts`
- Create: `src/session/format.ts`
- Test: `tests/session/store.test.ts`

- [ ] **Step 1: Write a failing session persistence test**

```ts
// tests/session/store.test.ts
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSessionStore } from "../../src/session/store.js";

describe("session store", () => {
  it("writes a session event log to disk", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "agent-session-"));
    const store = createSessionStore(root);
    const session = await store.startSession({ task: "demo task" });
    await store.appendEvent(session.id, { type: "user_task", payload: { task: "demo task" } });
    const saved = await store.readSession(session.id);
    expect(saved.events).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run tests/session/store.test.ts`
Expected: FAIL because the session store does not exist yet.

- [ ] **Step 3: Implement session event types and a JSON-backed store**

```ts
// src/session/types.ts
export interface SessionEvent {
  type: "user_task" | "agent_message" | "tool_call" | "tool_result" | "delegation" | "final_result";
  payload: Record<string, unknown>;
  timestamp?: string;
}

export interface SessionRecord {
  id: string;
  task: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  events: SessionEvent[];
}
```

```ts
// src/session/store.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { SessionEvent, SessionRecord } from "./types.js";

export function createSessionStore(rootDir: string) {
  async function write(record: SessionRecord) {
    await mkdir(rootDir, { recursive: true });
    await writeFile(path.join(rootDir, `${record.id}.json`), JSON.stringify(record, null, 2));
  }

  return {
    async startSession(input: { task: string }) {
      const record: SessionRecord = {
        id: crypto.randomUUID(),
        task: input.task,
        status: "running",
        createdAt: new Date().toISOString(),
        events: [],
      };
      await write(record);
      return record;
    },
    async appendEvent(sessionId: string, event: SessionEvent) {
      const record = await this.readSession(sessionId);
      record.events.push({ ...event, timestamp: new Date().toISOString() });
      await write(record);
    },
    async readSession(sessionId: string) {
      const content = await readFile(path.join(rootDir, `${sessionId}.json`), "utf8");
      return JSON.parse(content) as SessionRecord;
    },
  };
}
```

- [ ] **Step 4: Re-run the session store test**

Run: `pnpm vitest run tests/session/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit session persistence**

```bash
git add src/session/types.ts src/session/store.ts src/session/format.ts tests/session/store.test.ts
git commit -m "feat: add json session persistence"
```

### Task 4: Implement the tool registry and local development tools

**Files:**

- Create: `src/tools/registry.ts`
- Create: `src/tools/read-file.ts`
- Create: `src/tools/write-file.ts`
- Create: `src/tools/search-code.ts`
- Create: `src/tools/run-command.ts`
- Test: `tests/tools/registry.test.ts`
- Test: `tests/tools/read-file.test.ts`
- Test: `tests/tools/write-file.test.ts`
- Test: `tests/tools/search-code.test.ts`
- Test: `tests/tools/run-command.test.ts`
- Create: `tests/fixtures/sample-repo/README.md`
- Create: `tests/fixtures/sample-repo/src/hello.ts`

- [ ] **Step 1: Write failing tests that define the tool contracts**

```ts
// tests/tools/registry.test.ts
import { describe, expect, it } from "vitest";
import { createToolRegistry } from "../../src/tools/registry.js";

describe("tool registry", () => {
  it("returns a tool by name", () => {
    const registry = createToolRegistry([
      { name: "demo_tool", description: "demo", schema: null, execute: async () => ({ ok: true }) },
    ]);
    expect(registry.get("demo_tool")?.name).toBe("demo_tool");
  });
});
```

```ts
// tests/tools/read-file.test.ts
import { describe, expect, it } from "vitest";
import path from "node:path";
import { createReadFileTool } from "../../src/tools/read-file.js";

describe("read_file tool", () => {
  it("reads a file inside the workspace", async () => {
    const tool = createReadFileTool(process.cwd());
    const filePath = path.join(process.cwd(), "tests/fixtures/sample-repo/README.md");
    const result = await tool.execute({ path: filePath });
    expect(result.content).toContain("sample repo");
  });
});
```

- [ ] **Step 2: Run the tool tests and confirm they fail**

Run: `pnpm vitest run tests/tools/*.test.ts`
Expected: FAIL because the registry and tool modules do not exist yet.

- [ ] **Step 3: Implement the tool registry and four local tools with structured results**

```ts
// src/tools/registry.ts
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  schema: unknown;
  execute(input: TInput): Promise<TOutput>;
}

export function createToolRegistry(tools: ToolDefinition[]) {
  const entries = new Map(tools.map((tool) => [tool.name, tool]));
  return {
    get(name: string) {
      return entries.get(name);
    },
    list() {
      return Array.from(entries.values());
    },
  };
}
```

```ts
// src/tools/run-command.ts
import { execa } from "execa";

export function createRunCommandTool(workspaceRoot: string) {
  return {
    name: "run_command",
    description: "Run a local shell command inside the workspace",
    schema: null,
    async execute(input: { command: string }) {
      try {
        const result = await execa({ shell: true, cwd: workspaceRoot })`${input.command}`;
        return {
          ok: true,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        };
      } catch (error) {
        const failure = error as { stdout?: string; stderr?: string; exitCode?: number };
        return {
          ok: false,
          stdout: failure.stdout ?? "",
          stderr: failure.stderr ?? "",
          exitCode: failure.exitCode ?? 1,
        };
      }
    },
  };
}
```

- [ ] **Step 4: Re-run the tool tests**

Run: `pnpm vitest run tests/tools/*.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the tool system**

```bash
git add src/tools tests/tools tests/fixtures/sample-repo
git commit -m "feat: add local tool registry and development tools"
```

### Task 5: Add the provider implementation layer with an OpenAI-first path

**Files:**

- Modify: `src/providers/factory.ts`
- Create: `src/providers/openai.ts`
- Create: `src/providers/anthropic.ts`
- Modify: `src/providers/types.ts`
- Test: `tests/providers/factory.test.ts`

- [ ] **Step 1: Write a failing factory test that expects concrete provider modules**

```ts
// tests/providers/factory.test.ts
import { describe, expect, it } from "vitest";
import { createProvider } from "../../src/providers/factory.js";

describe("createProvider", () => {
  it("returns an OpenAI-backed client with a createModel function", () => {
    const provider = createProvider({ provider: "openai", model: "gpt-4.1", apiKey: "test-key" });
    expect(provider.name).toBe("openai");
    expect(typeof provider.createModel).toBe("function");
  });
});
```

- [ ] **Step 2: Run the provider test and confirm it fails**

Run: `pnpm vitest run tests/providers/factory.test.ts`
Expected: FAIL because the factory still returns a generic object.

- [ ] **Step 3: Implement provider-specific modules behind one interface**

```ts
// src/providers/openai.ts
import OpenAI from "openai";
import type { ProviderClient, ProviderConfig } from "./types.js";

export function createOpenAIProvider(config: ProviderConfig): ProviderClient {
  return {
    name: "openai",
    model: config.model,
    createModel() {
      return new OpenAI({ apiKey: config.apiKey });
    },
  };
}
```

```ts
// src/providers/anthropic.ts
import type { ProviderClient, ProviderConfig } from "./types.js";

export function createAnthropicProvider(config: ProviderConfig): ProviderClient {
  return {
    name: "anthropic",
    model: config.model,
    createModel() {
      return {
        provider: "anthropic",
        model: config.model,
        status: "planned-extension",
      };
    },
  };
}
```

```ts
// src/providers/factory.ts
import { createAnthropicProvider } from "./anthropic.js";
import { createOpenAIProvider } from "./openai.js";
import type { ProviderClient, ProviderConfig } from "./types.js";

export function createProvider(config: ProviderConfig): ProviderClient {
  if (config.provider === "anthropic") {
    return createAnthropicProvider(config);
  }
  return createOpenAIProvider(config);
}
```

- [ ] **Step 4: Re-run the provider test**

Run: `pnpm vitest run tests/providers/factory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the provider layer**

```bash
git add src/providers tests/providers/factory.test.ts
git commit -m "feat: add openai-first provider implementations"
```

### Task 6: Implement the orchestrator, sub-agents, and delegation helpers

**Files:**

- Create: `src/agents/orchestrator.ts`
- Create: `src/agents/research-agent.ts`
- Create: `src/agents/coding-agent.ts`
- Create: `src/agents/reviewer-agent.ts`
- Create: `src/agents/delegation.ts`
- Create: `src/memory/context.ts`
- Test: `tests/agents/delegation.test.ts`

- [ ] **Step 1: Write a failing delegation test**

```ts
// tests/agents/delegation.test.ts
import { describe, expect, it } from "vitest";
import { chooseSubAgent } from "../../src/agents/delegation.js";

describe("chooseSubAgent", () => {
  it("routes repository inspection work to research-agent", () => {
    expect(chooseSubAgent("Inspect the repo structure and summarize it")).toBe("research-agent");
  });
});
```

- [ ] **Step 2: Run the delegation test and confirm it fails**

Run: `pnpm vitest run tests/agents/delegation.test.ts`
Expected: FAIL because the agent modules do not exist yet.

- [ ] **Step 3: Implement the three sub-agents, routing helper, and orchestrator shape with visible Agent SDK usage**

```ts
// src/agents/delegation.ts
export type AgentRole = "research-agent" | "coding-agent" | "reviewer-agent" | null;

export function chooseSubAgent(task: string): AgentRole {
  const normalized = task.toLowerCase();
  if (
    normalized.includes("inspect") ||
    normalized.includes("analyze") ||
    normalized.includes("summarize")
  ) {
    return "research-agent";
  }
  if (normalized.includes("review") || normalized.includes("check")) {
    return "reviewer-agent";
  }
  if (
    normalized.includes("add") ||
    normalized.includes("implement") ||
    normalized.includes("change")
  ) {
    return "coding-agent";
  }
  return null;
}
```

```ts
// src/agents/research-agent.ts
import { Agent } from "@openai/agents";

export function createResearchAgent(tools: unknown[]) {
  return new Agent({
    name: "research-agent",
    instructions:
      "Inspect the repository, gather bounded context, and return concise findings only.",
    tools,
  });
}
```

```ts
// src/agents/coding-agent.ts
import { Agent } from "@openai/agents";

export function createCodingAgent(tools: unknown[]) {
  return new Agent({
    name: "coding-agent",
    instructions:
      "Make focused code changes inside the provided scope and summarize the edits clearly.",
    tools,
  });
}
```

```ts
// src/agents/reviewer-agent.ts
import { Agent } from "@openai/agents";

export function createReviewerAgent(tools: unknown[]) {
  return new Agent({
    name: "reviewer-agent",
    instructions:
      "Review the proposed result, identify gaps, and return a short validation summary.",
    tools,
  });
}
```

```ts
// src/agents/orchestrator.ts
import { Agent, run } from "@openai/agents";
import type { ProviderClient } from "../providers/types.js";
import { chooseSubAgent } from "./delegation.js";
import { createResearchAgent } from "./research-agent.js";
import { createCodingAgent } from "./coding-agent.js";
import { createReviewerAgent } from "./reviewer-agent.js";

export async function runOrchestrator(input: {
  task: string;
  tools: unknown[];
  provider: ProviderClient;
}) {
  const delegatedAgent = chooseSubAgent(input.task);
  const agentMap = {
    "research-agent": createResearchAgent(input.tools),
    "coding-agent": createCodingAgent(input.tools),
    "reviewer-agent": createReviewerAgent(input.tools),
  };
  const activeAgent = delegatedAgent
    ? agentMap[delegatedAgent]
    : new Agent({
        name: "orchestrator",
        instructions:
          "Route work carefully, use tools deliberately, and keep the response concise.",
        model: input.provider.createModel(),
        tools: input.tools,
      });
  const result = await run(activeAgent, input.task);
  return {
    delegatedAgent,
    summary:
      typeof result.finalOutput === "string"
        ? result.finalOutput
        : JSON.stringify(result.finalOutput),
  };
}
```

- [ ] **Step 4: Re-run the delegation test**

Run: `pnpm vitest run tests/agents/delegation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the initial agent layer**

```bash
git add src/agents src/memory tests/agents/delegation.test.ts
git commit -m "feat: add orchestrator and sub-agent delegation"
```

### Task 7: Wire application bootstrap and CLI commands

**Files:**

- Create: `src/app/bootstrap.ts`
- Create: `src/cli/program.ts`
- Create: `src/cli/renderers.ts`
- Create: `src/index.ts`
- Test: `tests/cli/chat-command.test.ts`
- Test: `tests/cli/run-command.test.ts`
- Test: `tests/cli/resume-command.test.ts`
- Test: `tests/cli/history-command.test.ts`

- [ ] **Step 1: Write failing CLI tests for the four approved commands**

```ts
// tests/cli/chat-command.test.ts
import { describe, expect, it } from "vitest";
import { buildProgram } from "../../src/cli/program.js";

describe("agent chat command", () => {
  it("registers a chat command", () => {
    const program = buildProgram();
    expect(program.commands.some((command) => command.name() === "chat")).toBe(true);
  });
});
```

```ts
// tests/cli/run-command.test.ts
import { describe, expect, it } from "vitest";
import { buildProgram } from "../../src/cli/program.js";

describe("agent run command", () => {
  it("registers a run command", () => {
    const program = buildProgram();
    expect(program.commands.some((command) => command.name() === "run")).toBe(true);
  });
});
```

```ts
// tests/cli/resume-command.test.ts
import { describe, expect, it } from "vitest";
import { buildProgram } from "../../src/cli/program.js";

describe("agent resume command", () => {
  it("registers a resume command", () => {
    const program = buildProgram();
    expect(program.commands.some((command) => command.name() === "resume")).toBe(true);
  });
});
```

```ts
// tests/cli/history-command.test.ts
import { describe, expect, it } from "vitest";
import { buildProgram } from "../../src/cli/program.js";

describe("agent history command", () => {
  it("registers a history command", () => {
    const program = buildProgram();
    expect(program.commands.some((command) => command.name() === "history")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the CLI tests and confirm they fail**

Run: `pnpm vitest run tests/cli/chat-command.test.ts tests/cli/run-command.test.ts tests/cli/resume-command.test.ts tests/cli/history-command.test.ts`
Expected: FAIL because the CLI program does not exist yet.

- [ ] **Step 3: Implement bootstrap wiring and the four approved commands**

```ts
// src/cli/program.ts
import { Command } from "commander";

export function buildProgram() {
  const program = new Command().name("agent");
  program.command("chat").description("Start an interactive agent session");
  program.command("run").argument("<task>").description("Run a coding-agent task");
  program.command("resume").argument("<sessionId>").description("Resume a previous session");
  program.command("history").description("List previous sessions");
  return program;
}
```

```ts
// src/index.ts
import { buildProgram } from "./cli/program.js";

await buildProgram().parseAsync(process.argv);
```

- [ ] **Step 4: Re-run the CLI tests**

Run: `pnpm vitest run tests/cli/chat-command.test.ts tests/cli/run-command.test.ts tests/cli/resume-command.test.ts tests/cli/history-command.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the CLI shell**

```bash
git add src/index.ts src/cli src/app tests/cli
git commit -m "feat: add cli command surface"
```

### Task 8: Connect the runtime end to end and verify the demo flows

**Files:**

- Modify: `src/app/bootstrap.ts`
- Modify: `src/agents/orchestrator.ts`
- Modify: `src/cli/program.ts`
- Modify: `src/session/store.ts`
- Modify: `README.md`
- Test: `tests/cli/run-command.test.ts`
- Test: `tests/cli/history-command.test.ts`

- [ ] **Step 1: Write a failing integration-style test for `agent run` creating a session**

```ts
// tests/cli/run-command.test.ts
import { describe, expect, it } from "vitest";
import { runTask } from "../../src/app/bootstrap.js";

describe("runTask", () => {
  it("returns a session id and orchestrator summary", async () => {
    const result = await runTask({ task: "Inspect the sample repo" });
    expect(result.sessionId).toBeTruthy();
    expect(result.summary).toContain("research-agent");
  });
});
```

- [ ] **Step 2: Run the integration test and confirm it fails**

Run: `pnpm vitest run tests/cli/run-command.test.ts`
Expected: FAIL because the bootstrap/runtime path is not connected yet.

- [ ] **Step 3: Implement the application runner that binds config, provider, tools, sessions, and orchestrator**

```ts
// src/app/bootstrap.ts
import { loadConfig } from "./config.js";
import { createProvider } from "../providers/factory.js";
import { createToolRegistry } from "../tools/registry.js";
import { createReadFileTool } from "../tools/read-file.js";
import { createWriteFileTool } from "../tools/write-file.js";
import { createSearchCodeTool } from "../tools/search-code.js";
import { createRunCommandTool } from "../tools/run-command.js";
import { createSessionStore } from "../session/store.js";
import { runOrchestrator } from "../agents/orchestrator.js";

export async function runTask(input: { task: string }) {
  const config = loadConfig({});
  const provider = createProvider({
    provider: config.provider,
    model: config.model,
    apiKey: process.env.OPENAI_API_KEY,
  });
  const tools = createToolRegistry([
    createReadFileTool(process.cwd()),
    createWriteFileTool(process.cwd()),
    createSearchCodeTool(process.cwd()),
    createRunCommandTool(process.cwd()),
  ]).list();
  const store = createSessionStore(config.sessionDir);
  const session = await store.startSession({ task: input.task });
  await store.appendEvent(session.id, { type: "user_task", payload: { task: input.task } });
  const result = await runOrchestrator({ task: input.task, provider, tools });
  await store.appendEvent(session.id, { type: "final_result", payload: result });
  return { sessionId: session.id, summary: result.summary };
}
```

- [ ] **Step 4: Run targeted tests, then the full suite, then a manual CLI smoke test**

Run: `pnpm vitest run tests/cli/chat-command.test.ts tests/cli/run-command.test.ts tests/cli/resume-command.test.ts tests/cli/history-command.test.ts tests/agents/delegation.test.ts`
Expected: PASS.

Run: `pnpm test`
Expected: PASS.

Run: `pnpm build`
Expected: PASS.

Run: `pnpm dev -- run "Inspect the sample repo and summarize it"`
Expected: a printed summary plus a new JSON file in `sessions/`.

- [ ] **Step 5: Update README with setup and demo commands, then commit**

````md
## Quick start

```bash
pnpm install
cp .env.example .env
pnpm dev -- run "Inspect the sample repo and summarize it"
pnpm dev -- history
```
````

````

```bash
git add src/app/bootstrap.ts src/agents/orchestrator.ts src/cli/program.ts src/session/store.ts README.md tests/cli
git commit -m "feat: wire end-to-end coding agent demo flow"
````

## Final Verification Checklist

- [ ] `pnpm install`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm dev -- run "Inspect the sample repo and summarize it"`
- [ ] `pnpm dev -- chat`
- [ ] `pnpm dev -- history`
- [ ] `pnpm dev -- resume <sessionId>`
- [ ] Confirm a JSON session file is written under `sessions/`
- [ ] Confirm the README matches the actual command surface

## Spec Coverage Map

- CLI app with four approved commands → Tasks 1, 7, 8
- Orchestrator plus three sub-agents → Task 6
- Typed tool calling and local tools → Task 4
- Provider abstraction with OpenAI-first path → Tasks 2 and 5
- Session logging and replayable artifacts → Tasks 3 and 8
- Tests across unit, integration, and demo smoke checks → Tasks 1 through 8
