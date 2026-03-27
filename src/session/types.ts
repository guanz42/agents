export interface SessionEvent {
  type:
    | "user_task"
    | "user_message"
    | "agent_message"
    | "tool_call"
    | "tool_result"
    | "delegation"
    | "final_result";
  payload: Record<string, unknown>;
  timestamp?: string;
}

export interface SessionRecord {
  id: string;
  task: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  events: SessionEvent[];
}
