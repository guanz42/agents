import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  build: {
    lib: {
      entry: "src/index.ts",
      name: "coding-agent-demo",
      fileName: "index",
      formats: ["es"],
    },
    outDir: "dist",
    rollupOptions: {
      external: [
        /^node:.*/,
        /^@openai\/.*/,
        /^@anthropic-ai\/.*/,
        "commander",
        "execa",
        "zod",
        "openai",
      ],
    },
  },
});
