# Coding Agent Demo

Minimal TypeScript CLI scaffold for a learning-oriented coding-agent demo.

## Quick start

```bash
pnpm install
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

The CLI now loads `.env` automatically at startup. If you use `AGENT_PROVIDER=openai-compatible`, configure both `OPENAI_API_KEY` and `OPENAI_BASE_URL`.
