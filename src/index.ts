import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

if (existsSync(".env")) {
  loadEnvFile(".env");
}

process.env.OPENAI_AGENTS_DISABLE_TRACING ??= "1";

const { bootstrapApp } = await import("./app/bootstrap.js");

await bootstrapApp().program.parseAsync(process.argv);
