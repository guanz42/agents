import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import { bootstrapApp } from "../../src/app/bootstrap.js";
import { createSessionStore } from "../../src/session/store.js";

describe("agent history command", () => {
  it("lists persisted sessions with useful metadata", async () => {
    const sessionDir = mkdtempSync(path.join(tmpdir(), "agent-history-"));
    const store = createSessionStore(sessionDir);

    const first = await store.startSession({ task: "Inspect module boundaries" });
    await store.appendEvent(first.id, {
      type: "user_task",
      payload: { task: "Inspect module boundaries" },
    });
    await store.updateStatus(first.id, "completed");

    const second = await store.startSession({ task: "Review the parser changes" });
    await store.appendEvent(second.id, {
      type: "user_task",
      payload: { task: "Review the parser changes" },
    });
    await store.updateStatus(second.id, "failed");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const { program } = bootstrapApp({
        commandHandlerDeps: {
          config: {
            sessionDir,
          },
        },
      });

      await program.parseAsync(["node", "agent", "history"]);

      const messages = logSpy.mock.calls.map(([message]) => String(message));
      expect(messages.some((message) => message.includes(first.id))).toBe(true);
      expect(messages.some((message) => message.includes(second.id))).toBe(true);
      expect(messages.some((message) => message.includes("Inspect module boundaries"))).toBe(true);
      expect(messages.some((message) => message.includes("Review the parser changes"))).toBe(true);
      expect(messages.some((message) => message.includes("events=1"))).toBe(true);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("prints an explicit no-history message when no sessions exist", async () => {
    const sessionDir = mkdtempSync(path.join(tmpdir(), "agent-history-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const { program } = bootstrapApp({
        commandHandlerDeps: {
          config: {
            sessionDir,
          },
        },
      });

      await program.parseAsync(["node", "agent", "history"]);
      expect(logSpy).toHaveBeenCalledWith("No sessions found.");
    } finally {
      logSpy.mockRestore();
    }
  });
});
