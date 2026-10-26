"""Single-worker durable Agent Loop with explicit write approval and recovery.

No distributed worker lease; run only one process per run_id. Tool effects must
be idempotent or support external lookup to recover an unknown outcome.
"""
import json
from pathlib import Path

from .connector import OutcomeUnknown
from .eval import grade
from .state import Store
from .tools import ToolRegistry, ToolRejected
from .workspace import Workspace


class SimulatedCrash(RuntimeError):
    """Raised strictly after a real tool effect but before result persistence."""


class Engine:
    def __init__(self, workspace: Workspace, store: Store, model, tools: ToolRegistry):
        self.workspace, self.store, self.model, self.tools = workspace,store,model,tools

    @staticmethod
    def _pending_calls(messages):
        # Process unreturned calls from the most recent assistant tool-call message.
        last_assistant = next((m for m in reversed(messages) if m["role"] == "assistant"), None)
        if not last_assistant:
            return []
        answered = {m["tool_call_id"] for m in messages if m["role"] == "tool"}
        return [c for c in last_assistant.get("tool_calls", []) if c["id"] not in answered]

    def _tool(self, run_id, call, *, crash_after_effect: str | None):
        if call.get("type") != "function":
            raise ValueError("unsupported tool type")
        name = call["function"]["name"]
        args = json.loads(call["function"]["arguments"])
        if not isinstance(args, dict):
            raise ValueError("tool arguments must be object")
        row = self.store.intent(run_id, call["id"], name, args)
        if row["state"] == "done":
            return json.loads(row["result"])

        # Policy validation also applies to recovered calls.
        try:
            spec = self.tools.validate(name, args)
        except ToolRejected as exc:
            result = {"ok": False, "error": str(exc)}
            self.store.mark_complete(run_id,call["id"],result)
            self.store.event(run_id,"tool.rejected",name + ":" + str(exc))
            return result

        if spec.require_approval and not self.store.consume_approval(run_id, call["id"]):
            self.store.event(run_id,"approval.required",call["id"])
            return None

        # Stable business identifier per logical operation. Never generate a new
        # one on retry, even if the process restarted.
        key = run_id + ":" + call["id"]
        if name == "create_followup" and row["state"] in ("started", "uncertain"):
            try:
                item = self.tools.connector.find_followup(key)
            except Exception:
                self.store.event(run_id,"tool.outcome_unknown",name)
                return "OUTCOME_UNKNOWN"
            if item is None:
                # A remote call could still be in flight; do not blindly retry.
                self.store.event(run_id,"tool.needs_review",name)
                return "OUTCOME_UNKNOWN"
            result = {"ok": True, "value": item}
            self.store.mark_complete(run_id,call["id"],result)
            self.store.event(run_id,"tool.confirmed_from_remote",name)
            return result

        self.store.mark_started(run_id,call["id"])
        self.store.event(run_id,"tool.started",name)
        try:
            value = self.tools.execute(name,args,idempotency_key=key)
            if crash_after_effect == name:
                raise SimulatedCrash("process terminated after " + name + " effect")
            result = {"ok": True, "value": value}
        except SimulatedCrash:
            raise
        except OutcomeUnknown:
            with self.store.db:
                self.store.db.execute("UPDATE intents SET state='uncertain' WHERE run_id=? AND call_id=?",(run_id,call["id"]))
            self.store.event(run_id,"tool.outcome_unknown",name)
            return "OUTCOME_UNKNOWN"
        except Exception as exc:
            result = {"ok": False, "error": type(exc).__name__}
        self.store.mark_complete(run_id,call["id"],result)
        self.store.event(run_id,"tool.completed" if result["ok"] else "tool.failed",name)
        return result

    def run(self, *, run_id: str = "demo-run", task_id: str = "demo-task",
            user_id: str = "local-user", goal: str = "分析本地资料并生成报告",
            followup: bool = False, max_turns: int = 12, max_tool_calls: int = 20,
            crash_after_effect: str | None = None) -> dict:
        row = self.store.run(run_id)
        if row is None:
            self.store.create_run(run_id,task_id,user_id,goal,followup,self.workspace.snapshot_inputs())
            row = self.store.run(run_id)
        elif (row["task_id"],row["user_id"],bool(row["followup"])) != (task_id,user_id,followup):
            raise ValueError("run identity/options mismatch")
        if row["status"] in ("completed","failed","cancelled"):
            return {"status": row["status"], "answer": row["final_answer"]}

        messages = json.loads(row["messages"])
        turns = row["turns"]
        while True:
            pending = self._pending_calls(messages)
            if not pending:
                if turns >= max_turns:
                    self.store.checkpoint(run_id,messages,status="budget_exhausted")
                    return {"status":"budget_exhausted"}
                # Real model may raise network/protocol exceptions: persist a
                # recoverable error state; the caller can retry same Run later.
                try:
                    assistant = self.model.reply(messages,self.tools.schemas(),followup=followup)
                except Exception as exc:
                    self.store.checkpoint(run_id,messages,status="waiting",error=type(exc).__name__)
                    self.store.event(run_id,"model.failed",type(exc).__name__)
                    return {"status":"waiting", "error":type(exc).__name__}
                if assistant.get("role") != "assistant":
                    raise ValueError("model must return assistant message")
                messages.append(assistant)
                turns += 1
                self.store.checkpoint(run_id,messages,turns=turns,status="running")
                self.store.event(run_id,"model.replied",f"tool_calls={len(assistant.get('tool_calls',[]))}")
                if not assistant.get("tool_calls"):
                    existing = self.store.db.execute("""SELECT result FROM intents
                      WHERE run_id=? AND name='create_followup' AND state='done'
                      ORDER BY rowid DESC LIMIT 1""",(run_id,)).fetchone()
                    external = None
                    if existing:
                        data=json.loads(existing["result"])
                        if data["ok"]:
                            external = data["value"]
                    acceptance = grade(
                        self.workspace,json.loads(row["input_hashes"]),
                        followup=followup,external_item=external
                    )
                    status = "completed" if acceptance["passed"] else "failed"
                    self.store.checkpoint(run_id,messages,status=status,
                        answer=assistant.get("content") or "",error=",".join(acceptance["reasons"]))
                    self.store.event(run_id,"run." + status,",".join(acceptance["reasons"]))
                    return {"status":status,"answer":assistant.get("content") or "", "acceptance":acceptance}
                pending = assistant["tool_calls"]

            completed_calls = sum(m["role"] == "tool" for m in messages)
            if completed_calls + len(pending) > max_tool_calls:
                self.store.checkpoint(run_id,messages,status="budget_exhausted")
                self.store.event(run_id,"budget.exhausted","tool_calls")
                return {"status":"budget_exhausted","reason":"tool_call_budget"}
            for call in pending:
                result = self._tool(run_id,call,crash_after_effect=crash_after_effect)
                if result is None:
                    self.store.checkpoint(run_id,messages,status="waiting")
                    return {"status":"waiting","reason":"approval_required","call_id":call["id"]}
                if result == "OUTCOME_UNKNOWN":
                    self.store.checkpoint(run_id,messages,status="needs_review")
                    return {"status":"needs_review","reason":"external_outcome_unknown","call_id":call["id"]}
                messages.append({"role":"tool","tool_call_id":call["id"],
                                 "content":json.dumps(result,ensure_ascii=False)})
                self.store.checkpoint(run_id,messages,status="running")
