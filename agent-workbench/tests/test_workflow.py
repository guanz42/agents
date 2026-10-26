import json
import sqlite3
import pytest

from workbench.engine import Engine, SimulatedCrash
from workbench.models import FakeModel
from workbench.state import Store
from workbench.tools import ToolRegistry
from workbench.eval import grade
from workbench.workspace import Workspace


def make_engine(workspace, connector):
    store=Store(workspace.root/".workbench"/"state.sqlite")
    engine=Engine(workspace,store,FakeModel(),ToolRegistry(workspace,connector))
    return engine,store


def test_offline_end_to_end(workspace, connector):
    before=workspace.snapshot_inputs()
    e,s=make_engine(workspace,connector)
    result=e.run()
    assert result["status"]=="completed"
    assert result["acceptance"]["passed"]
    assert workspace.snapshot_inputs()==before
    body=(workspace.artifacts/"report.md").read_text(encoding="utf-8")
    assert "金额合计：0.30" in body
    assert "补充数据验收" in body
    assert len([x for x in s.events("demo-run") if x["kind"]=="tool.completed"])==4
    assert e.run()["status"]=="completed"
    s.close()


def test_write_then_crash_recovers_exact_artifact(workspace,connector):
    e,s=make_engine(workspace,connector)
    with pytest.raises(SimulatedCrash):
        e.run(crash_after_effect="write_artifact")
    content=(workspace.artifacts/"report.md").read_bytes()
    row=s.intent_row("demo-run","fake-write_artifact")
    assert row["state"]=="started"
    s.close()
    e,s=make_engine(workspace,connector)
    assert e.run()["status"]=="completed"
    assert (workspace.artifacts/"report.md").read_bytes()==content
    done=s.intent_row("demo-run","fake-write_artifact")
    assert done["state"]=="done" and json.loads(done["result"])["value"]["reused"]
    s.close()


def test_followup_requires_exact_approval(workspace,connector):
    e,s=make_engine(workspace,connector)
    first=e.run(followup=True)
    assert first["status"]=="waiting" and first["reason"]=="approval_required"
    assert connector.writes==0
    p=s.pending_approval("demo-run")
    assert p["call_id"]==first["call_id"]
    s.approve("demo-run",first["call_id"],"owner")
    result=e.run(followup=True)
    assert result["status"]=="completed" and connector.writes==1
    assert e.run(followup=True)["status"]=="completed"
    assert connector.writes==1
    s.close()


def test_followup_lost_reply_confirmed_on_resume(workspace,connector):
    e,s=make_engine(workspace,connector)
    assert e.run(followup=True)["status"]=="waiting"
    s.approve("demo-run","fake-create_followup","owner")
    connector.drop_reply_once=True
    result=e.run(followup=True)
    assert result["status"]=="needs_review"
    assert connector.writes==1
    s.close()
    e,s=make_engine(workspace,connector)
    recovered=e.run(followup=True)
    assert recovered["status"]=="completed"
    assert connector.writes==1
    assert any(x["kind"]=="tool.confirmed_from_remote" for x in s.events("demo-run"))
    s.close()


def test_followup_unknown_stays_needs_review(workspace,connector):
    e,s=make_engine(workspace,connector)
    e.run(followup=True)
    s.approve("demo-run","fake-create_followup","owner")
    with pytest.raises(SimulatedCrash):
        e.run(followup=True,crash_after_effect="create_followup")
    assert connector.writes==1
    # Simulate remote being unreachable/no proof of outcome.
    def unavailable(_key):
        raise ConnectionError()
    connector.find_followup=unavailable
    assert e.run(followup=True)["status"]=="needs_review"
    assert connector.writes==1
    s.close()


def test_approval_is_bound_to_arguments(workspace,connector):
    e,s=make_engine(workspace,connector)
    e.run(followup=True)
    s.approve("demo-run","fake-create_followup","owner")
    with s.db:
        s.db.execute("UPDATE approvals SET digest=? WHERE run_id=?",("incorrect","demo-run"))
    assert e.run(followup=True)["status"]=="waiting"
    assert connector.writes==0
    s.close()


def test_different_run_identity_rejected(workspace,connector):
    e,s=make_engine(workspace,connector)
    e.run()
    with pytest.raises(ValueError, match="identity"):
        e.run(user_id="attacker")
    s.close()


def test_model_premature_completion_fails_acceptance(workspace,connector):
    class StopEarly:
        def reply(self, messages,tools,*,followup):
            return {"role":"assistant","content":"我完成了"}
    s=Store(workspace.root/".workbench"/"state.sqlite")
    e=Engine(workspace,s,StopEarly(),ToolRegistry(workspace,connector))
    result=e.run()
    assert result["status"]=="failed"
    assert "report_missing" in result["acceptance"]["reasons"]
    s.close()


def test_model_repeated_tool_is_bounded(workspace,connector):
    class Looper:
        def __init__(self): self.index=0
        def reply(self,messages,tools,*,followup):
            self.index+=1
            return {"role":"assistant","content":"","tool_calls":[{
                "id": f"loop-{self.index}","type":"function",
                "function":{"name":"fetch_tasks","arguments":"{}"}
            }]}
    s=Store(workspace.root/".workbench"/"state.sqlite")
    e=Engine(workspace,s,Looper(),ToolRegistry(workspace,connector))
    assert e.run(max_turns=3)["status"]=="budget_exhausted"
    assert s.run("demo-run")["turns"]==3
    s.close()


def test_tool_policy_denies_write(workspace,connector):
    registry=ToolRegistry(workspace,connector,scopes={"file:read"})
    with pytest.raises(Exception, match="permission_denied"):
        registry.validate("write_artifact",{"path":"a.md","content":"x"})


def test_trace_does_not_persist_sensitive_args(workspace,connector):
    e,s=make_engine(workspace,connector)
    e.run()
    events=s.events("demo-run")
    joined="\n".join(x["detail"] for x in events)
    assert "本周完成项目联调" not in joined
    assert "# 工作报告" not in joined
    assert any(x["kind"]=="tool.started" for x in events)
    s.close()


def test_snapshot_flags_original_change(workspace):
    original=workspace.snapshot_inputs()
    (workspace.input/"notes.md").write_text("tampered",encoding="utf-8")
    assert not grade(workspace,original,followup=False)["passed"]


def test_csv_rejects_bad_number_and_nonfinite(workspace):
    from decimal import Decimal
    path=workspace.input/"sales.csv"
    path.write_text("amount\nunknown\n",encoding="utf-8")
    with pytest.raises(ValueError,match="line 2"):
        workspace.calculate("sales.csv")
    path.write_text("amount\nNaN\n",encoding="utf-8")
    with pytest.raises(ValueError,match="nonfinite"):
        workspace.calculate("sales.csv")


def test_path_escape_refused(workspace):
    with pytest.raises(PermissionError):
        workspace.read("../.workbench/state.sqlite")
    with pytest.raises(PermissionError):
        workspace.write_artifact("../input/notes.md","oops")
