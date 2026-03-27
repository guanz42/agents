# Coding Agent Demo

Minimal TypeScript CLI scaffold for a learning-oriented coding-agent demo.

## Quick start

```bash
vp install
cp .env.example .env
# then set OPENAI_API_KEY in .env
# if using an OpenAI-compatible provider, also set OPENAI_BASE_URL
pnpm dev -- run "Inspect the sample repo and summarize it"
pnpm dev -- history
```

## Command surface

```bash
pnpm dev -- chat
pnpm dev -- run "Implement a tiny parser improvement"
pnpm dev -- resume <sessionId>
pnpm dev -- history
```

`run` writes JSON session files to `./sessions` (or `AGENT_SESSION_DIR` when configured).

The CLI loads `.env` automatically at startup. If you use `AGENT_PROVIDER=openai-compatible`, configure both `OPENAI_API_KEY` and `OPENAI_BASE_URL`.

## Development

This project uses [Vite+](https://viteplus.dev/) as the unified toolchain:

```bash
vp test       # Run tests
vp check      # Run format, lint, and type checks
vp build      # Build for production
vp pack       # Build library package
```

Run the CLI:

```bash
pnpm dev -- <command>     # Development (tsx)
pnpm run build            # Build to ./dist
./dist/index.js <command> # Run built version
```
