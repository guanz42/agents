# Coding Agent Demo

Minimal TypeScript CLI scaffold for a learning-oriented coding-agent demo.

## Quick start

```bash
bun install
cp .env.example .env
# then set OPENAI_API_KEY in .env
# if using an OpenAI-compatible provider, also set OPENAI_BASE_URL
bun run dev                        # Start interactive chat session
bun run dev -- "Inspect the repo"  # Run task then enter chat
bun run dev -- history
```

**Note:** Interactive chat mode requires a terminal with stdin support.

## Command surface

```bash
bun run dev                        # Start interactive chat session (default)
bun run dev -- "Fix the bug"       # Run task then enter chat
bun run dev -- resume <sessionId>  # Resume a previous session
bun run dev -- history             # List previous sessions
```

All commands write JSON session files to `./sessions` (or `AGENT_SESSION_DIR` when configured).

The CLI loads `.env` automatically at startup. If you use `AGENT_PROVIDER=openai-compatible`, configure both `OPENAI_API_KEY` and `OPENAI_BASE_URL`.

## Development

This project uses [Bun](https://bun.sh/) as the runtime and toolchain:

```bash
bun test       # Run tests
bun run lint   # Run TypeScript type check
bun run build  # Build for production
```

Run the CLI:

```bash
bun run dev -- <command>   # Development (tsx)
bun run build              # Build to ./dist
bun run ./dist/index.js    # Run built version
```
