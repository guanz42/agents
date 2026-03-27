import { describe, expect, it } from "vite-plus/test";
import { loadConfig } from "../src/app/config.js";

describe("loadConfig", () => {
  it("normalizes sessionDir and provider defaults", () => {
    const config = loadConfig({});
    expect(config.provider).toBe("openai");
    expect(config.sessionDir).toContain("sessions");
  });

  it("defaults to gpt-4.1 model", () => {
    const config = loadConfig({});
    expect(config.model).toBe("gpt-4.1");
  });

  it("resolves sessionDir relative to cwd", () => {
    const config = loadConfig({});
    expect(config.sessionDir).toBe(process.cwd() + "/sessions");
  });
});
