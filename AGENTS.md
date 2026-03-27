<!--BUN START-->

# Using Bun - The All-in-One JavaScript Runtime

This project uses [Bun](https://bun.sh/) as the unified runtime and toolchain. Bun replaces Node.js, npm/pnpm, Jest/Vitest, and webpack/Rollup with a single fast tool.

## Bun Workflow

### Install Dependencies

```bash
bun install          # Install dependencies
bun add <package>    # Add a dependency
bun remove <package> # Remove a dependency
```

### Development

```bash
bun run dev          # Run development mode (uses tsx)
bun run lint         # Run TypeScript type check
bun run typecheck    # Alias for lint
```

### Testing

```bash
bun test             # Run all tests
bun test --watch     # Run tests in watch mode
bun test <pattern>   # Run tests matching pattern
```

### Build

```bash
bun run build        # Build for production
```

### Run Scripts

```bash
bun run <script>     # Run a package.json script
```

## Common Pitfalls

- **Don't use Node.js directly:** Use `bun run` to execute TypeScript files. Bun has native TypeScript support.
- **Don't install Jest or Vitest:** Use `bun test` for testing.
- **Don't use webpack or Rollup:** Use `bun build` for bundling.
- **Import from `bun:test`:** For tests, import test utilities from `bun:test`, not `vitest` or `vite-plus/test`.
- **Use `bun install` not `pnpm/npm/yarn`:** Bun manages its own lockfile (`bun.lock`).

## Running TypeScript

Bun can run TypeScript files directly without transpilation:

```bash
bun run src/index.ts    # Run TypeScript file
```

## CI Integration

```yaml
- uses: oven-sh/setup-bun@v2
  with:
    bun-version: latest
- run: bun install
- run: bun run lint
- run: bun test
```

## Review Checklist for Agents

- [ ] Run `bun install` after pulling remote changes.
- [ ] Run `bun run lint` and `bun test` to validate changes.
- [ ] Use `bun:test` for new test files, not `vitest` or `vite-plus/test`.

<!--BUN END-->
