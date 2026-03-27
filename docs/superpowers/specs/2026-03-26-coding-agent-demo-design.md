# Coding Agent Demo Design Spec

## Document Status

- Date: 2026-03-26
- Status: Validated design spec
- Deliverable: Learning-focused CLI coding agent demo project

## Summary

This project is a TypeScript and Node.js CLI demo that teaches agent engineering through a coding-agent workflow. It uses an Agent SDK as the primary framework and focuses on orchestration, tool calling, sub-agent delegation, session logging, and provider abstraction.

The first version is intentionally medium in completeness. It should feel realistic enough to demonstrate mature patterns, but small enough to remain teachable and understandable in a single codebase.

## Goals

- Build a CLI project, not a web UI.
- Teach how an orchestrator agent coordinates tools, sub-agents, and execution flow.
- Show how specialized sub-agents can be defined and delegated to for scoped work.
- Demonstrate a clean provider abstraction with an OpenAI-first implementation path and room for Anthropic support.
- Capture session events, messages, tool calls, and outcomes so users can inspect how the system behaved.
- Favor common engineering patterns, readable module boundaries, and low learning cost.

## Non-Goals

- Building a production-grade replacement for Claude Code, Codex, or similar tools.
- Supporting a browser UI, remote multi-user collaboration, or persistent hosted services.
- Implementing autonomous long-running background jobs beyond the needs of the demo.
- Solving full repository editing, sandboxing, approvals, or security hardening at production depth.
- Adding advanced memory retrieval, vector search, or large-scale planning systems in v1.

## First-Version Boundaries

The v1 demo should include:

- A local CLI entry point for running coding-agent tasks.
- A primary orchestrator agent built with the Agent SDK.
- A small set of sub-agents with clear responsibilities.
- A tool system that supports filesystem inspection, shell execution, and structured project analysis.
- Session logging to local files for replay and inspection.
- Provider abstraction interfaces with OpenAI implemented first.

The v1 demo should not include:

- Web UI or chat frontend.
- Complex permission workflows.
- Distributed execution.
- Multi-provider feature parity on day one.
- Rich memory beyond session-scoped context and logs.

## Architecture Overview

The architecture is centered on a single CLI process that loads configuration, creates a runtime session, selects a model provider, constructs the orchestrator agent, registers tools, and executes a task loop.

At a high level:

1. The CLI receives a user task and runtime options.
2. The session layer creates a run record and log sink.
3. The provider layer supplies a model client through a stable interface.
4. The agent runtime instantiates the orchestrator using the Agent SDK.
5. The orchestrator decides whether to answer directly, call tools, or delegate to a sub-agent.
6. Tool results and sub-agent outputs are returned to the orchestrator.
7. The session logger records each important event.
8. The CLI renders a concise result summary and points to the saved session log.

This keeps the learning focus on orchestration and runtime structure instead of UI concerns.

## Module Breakdown

### `src/cli`

Owns command parsing, flags, help output, and process exit behavior. This layer should be thin and should pass structured input into the application runtime.

### `src/app`

Coordinates startup. It wires together configuration, logging, provider selection, tool registration, agent creation, and session lifecycle.

### `src/agents`

Contains orchestrator and sub-agent definitions, prompt construction, role metadata, and delegation policies. The Agent SDK usage should be most visible here.

### `src/tools`

Contains tool definitions, schemas, validation, and adapters for local capabilities such as filesystem reads and shell commands. Tools should expose consistent input and output shapes.

### `src/providers`

Defines the provider abstraction and concrete provider implementations. OpenAI should be the first implementation. Anthropic support should fit the same interface later without changing agent-level logic.

### `src/session`

Handles session IDs, event logging, transcript persistence, and local run artifacts. It should make debugging and teaching easier by preserving what happened during a run.

### `src/memory`

Stores session-scoped context assembly. In v1 this is intentionally narrow and should focus on active task context, recent tool outputs, and sub-agent results rather than long-term knowledge systems.

### `src/testing`

Holds fixtures, golden transcripts, test helpers, and scenario runners used to verify the demo behavior.

## Agent Roles and Responsibilities

### Orchestrator Agent

The orchestrator is the primary agent. It owns top-level reasoning, chooses when to use tools, decides when delegation is appropriate, and synthesizes the final answer.

Responsibilities:

- Interpret the user task.
- Maintain the current execution objective.
- Select tools or sub-agents based on task shape.
- Merge intermediate results into a coherent response.
- Avoid unnecessary delegation.

### `research-agent`

Used for codebase inspection, file discovery, and gathering structured context before edits or analysis. It should return concise findings, not final user-facing answers.

### `coding-agent`

Used when the orchestrator wants a bounded execution unit for code changes or focused implementation within a known scope.

### `reviewer-agent`

Used for validation passes such as checking scope alignment, output completeness, or whether a proposed change matches the request.

Sub-agents should be optional and narrowly scoped. The goal is to teach delegation patterns, not to create a complex agent society.

## Tool System

The demo should include a small, teachable tool set with clear contracts.

Core tool categories:

- File inspection tools for reading files, listing directories, and locating targets.
- Shell execution tools for running safe local commands relevant to development tasks.
- Structured analysis tools for searching code patterns or summarizing project structure.
- Session tools for viewing or summarizing prior events in the current run.

Tool design constraints:

- Each tool must have a clear input schema and predictable output format.
- Tool errors must be surfaced as structured results, not thrown raw into the agent loop.
- Tools should be composable and small rather than broad and magical.
- The demo should prefer transparency over convenience so learners can see the control flow.

## Provider Abstraction

The project must be provider-switchable by design, while still optimizing the initial implementation for OpenAI.

Provider abstraction requirements:

- Define a provider interface that hides vendor-specific client setup.
- Keep agent construction independent from provider-specific request code.
- Centralize model selection, authentication loading, and provider configuration.
- Preserve room for Anthropic support without forcing identical behavior across providers.

Implementation stance:

- OpenAI is the first supported provider and the default path for v1.
- Anthropic support is a planned extension behind the same abstraction layer.
- Provider switching should happen through configuration, not by changing orchestration code.

## Session and Memory Model

The session model is local, explicit, and inspectable.

Each run should create a session record containing:

- User input and normalized runtime options.
- Agent messages.
- Tool calls and tool outputs.
- Delegation events and sub-agent summaries.
- Final result metadata.
- Timestamps and status markers.

Memory behavior in v1:

- Session-scoped only.
- No long-term memory store required.
- Recent run context may be summarized to keep prompts compact.
- Logs are the primary learning artifact, not hidden memory systems.

This keeps the mental model simple for learners and supports replay-style debugging.

## CLI Commands

The command surface should stay small.

### `agent chat`

Starts an interactive CLI conversation with the orchestrator for exploratory learning and iterative coding-agent use.

Example concerns:

- provider selection
- model override
- session output path
- verbosity level

### `agent run "<task>"`

Runs the orchestrator on a user-provided coding task.

Example concerns:

- provider selection
- model override
- session output path
- verbosity level

### `agent resume <sessionId>`

Resumes a prior session so the user can continue work with preserved conversation and runtime context.

### `agent history`

Lists prior sessions so users can review and choose a session to resume or inspect through the CLI workflow.

The CLI should teach the system shape through its commands. It should not try to expose every internal primitive in v1.

## Demo Scenarios

The demo should include a few curated scenarios that show the intended concepts clearly.

### Scenario 1: Repository Exploration

The user asks the agent to inspect a small codebase and explain where a feature should be added. This demonstrates orchestration, file tools, and exploratory delegation.

### Scenario 2: Focused Code Change

The user asks for a bounded implementation update in a small demo repository. This demonstrates tool calling, execution sequencing, and result synthesis.

### Scenario 3: Review and Validation Pass

The user asks the agent to review recent changes, summarize risks, and suggest next checks. This demonstrates reviewer-style delegation and structured output.

### Scenario 4: Provider Switch Check

The user runs the same scenario with a different configured provider path once Anthropic support exists. This demonstrates the value of the abstraction layer without changing CLI behavior.

## Testing and Verification Strategy

The project should be verified at several layers.

### Unit Tests

- Provider interface behavior
- Tool input validation and output shaping
- Session event serialization
- Command parsing and option normalization

### Integration Tests

- End-to-end CLI runs against mocked provider responses
- Delegation flow between orchestrator and sub-agents
- Session log generation and inspection commands

### Golden Scenario Tests

- Curated transcript snapshots for the demo scenarios
- Stable assertions on event structure, not brittle verbatim model text where avoidable

### Manual Verification

- Run the primary demo commands locally
- Confirm logs are readable and useful for teaching
- Confirm the orchestrator uses tools and delegation in the expected sequence
- Confirm no command implies unsupported production-grade guarantees

## Implementation Constraints

- Use TypeScript and Node.js.
- Use an Agent SDK as the primary framework for agent construction and orchestration.
- Keep the architecture simple enough for learners to trace end to end.
- Prefer explicit modules and typed interfaces over hidden framework magic.
- Keep v1 medium in completeness, with realistic flow but limited surface area.
- Do not expand scope into web UI, advanced memory systems, or production security features.

## Risks

- If the Agent SDK abstractions are wrapped too heavily, the educational value drops because learners cannot see how the framework is being used.
- If the tool layer is too broad, the demo becomes harder to reason about and test.
- If provider abstraction is introduced too early in every module, the code may become more abstract than necessary for v1.
- If session logs are too verbose or too raw, they will not serve the teaching goal.

## Future Extensions

- Add Anthropic as a second provider through the existing provider interface.
- Add stronger sandboxing and approval controls for shell and file tools.
- Add richer session inspection views or transcript diffing.
- Add optional planning helpers once the core orchestration loop is well understood.
- Add more specialized sub-agents only after the base orchestration model is stable and easy to teach.

## Acceptance Criteria

This design is complete for v1 when:

- The project is clearly framed as a CLI coding-agent demo for learning agent engineering.
- The architecture centers on orchestration, tool calling, sub-agent delegation, session logging, and provider abstraction.
- Agent SDK is the primary framework in the design.
- OpenAI-first implementation is explicit, while provider switching remains part of the architecture.
- Scope boundaries are clear enough to prevent drift into unrelated product features.
- The document is concise, internally consistent, and free of placeholder text.
