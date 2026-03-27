import type { SessionEvent } from "../session/types.js";

export interface SessionContext {
  task: string;
  recentEvents: SessionEvent[];
}

export function buildSessionContext(input: {
  task: string;
  events?: SessionEvent[];
  maxEvents?: number;
}): SessionContext {
  const maxEvents = input.maxEvents ?? 10;

  return {
    task: input.task,
    recentEvents: (input.events ?? []).slice(-maxEvents),
  };
}
