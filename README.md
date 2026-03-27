# Coding Agent Demo

Minimal TypeScript CLI scaffold for a learning-oriented coding-agent demo.

## Quick start

```bash
vp install
cp .env.example .env
# then set OPENAI_API_KEY in .env
# if using an OpenAI-compatible provider, also set OPENAI_BASE_URL
pnpm dev                        # Start interactive chat session
pnpm dev -- "Inspect the repo"  # Run task then enter chat
pnpm dev -- history
```

**Note:** Interactive chat mode requires a terminal with stdin support.

## Command surface

```bash
pnpm dev                        # Start interactive chat session (default)
pnpm dev -- "Fix the bug"       # Run task then enter chat
pnpm dev -- resume <sessionId>  # Resume a previous session
pnpm dev -- history             # List previous sessions
```

All commands write JSON session files to `./sessions` (or `AGENT_SESSION_DIR` when configured).

The CLI loads `.env` automatically at startup. If you use `AGENT_PROVIDER=openai-compatible`, configure both `OPENAI_API_KEY` and `OPENAI_BASE_URL`.

## Development

This project uses [Vite+](https://viteplus.dev/) as the unified toolchain:

```bash
vp test       # Run tests
vp check      # Run format, lint, and type checks
vp build      # Build for production (with shebang)
```

Run the CLI:

```bash
pnpm dev -- <command>   # Development (tsx)
vp build                # Build to ./dist
node dist/index.js      # Run built version (or ./dist/index.js if executable)
```
