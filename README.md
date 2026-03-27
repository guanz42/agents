# Coding Agent Demo

Minimal TypeScript CLI scaffold for a learning-oriented coding-agent demo.

## Quick start

```bash
vp install
cp .env.example .env
# then set OPENAI_API_KEY in .env
# if using an OpenAI-compatible provider, also set OPENAI_BASE_URL
vp dev -- run "Inspect the sample repo and summarize it"
vp history
```

## Command surface

```bash
vp chat
vp run "Implement a tiny parser improvement"
vp resume <sessionId>
vp history
```

`run` writes JSON session files to `./sessions` (or `AGENT_SESSION_DIR` when configured).

The CLI loads `.env` automatically at startup. If you use `AGENT_PROVIDER=openai-compatible`, configure both `OPENAI_API_KEY` and `OPENAI_BASE_URL`.

## Development

This project uses [Vite+](https://viteplus.dev/) as the unified toolchain:

```bash
vp dev        # Start development mode
vp test       # Run tests
vp check      # Run format, lint, and type checks
vp build      # Build for production
vp pack       # Build library package
```
