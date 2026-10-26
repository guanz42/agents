"""Deterministic golden-case evaluation for offline integrated Agent Workbench.

Pass means actual status matched the expected outcome and any successful task
passed its business acceptance. It does NOT imply live-model task quality.
"""
import argparse
import json
import tempfile
import threading
from pathlib import Path
from statistics import median
from time import perf_counter

from .cli import init_demo
from .connector import LocalTaskConnector, OutcomeUnknown
from .demo_service import DemoTaskRepository, build_server
from .engine import Engine, SimulatedCrash
from .models import FakeModel
from .state import Store
from .tools import ToolRegistry
from .workspace import Workspace


class LoseReplyOnce(LocalTaskConnector):
    def __init__(self, url):
        super().__init__(url)
        self.lose = True

    def create_followup(self, title, note, idempotency_key):
        result = super().create_followup(title,note,idempotency_key)
        if self.lose:
            self.lose = False
            raise OutcomeUnknown("reply lost in experiment")
        return result


class EarlyFinish:
    def reply(self, messages, tools, *, followup):
        return {"role":"assistant","content":"报告已经生成"}


class ForbiddenTool:
    def reply(self, messages, tools, *, followup):
        if any(m["role"] == "tool" for m in messages):
            return {"role":"assistant","content":"工具执行完毕"}
        return {"role":"assistant","content":"","tool_calls":[{
            "id":"bad-call","type":"function","function":{
                "name":"shell","arguments":"{}"
            }
        }]}


def run_case(case: dict) -> dict:
    name=case["mode"]
    started=perf_counter()
    with tempfile.TemporaryDirectory() as directory:
        root=Path(directory)
        init_demo(root/"work")
        workspace=Workspace(root/"work")
        repo=DemoTaskRepository(root/"service.sqlite")
        server=build_server(repo,0)
        thread=threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        try:
            url=f"http://127.0.0.1:{server.server_port}"
            connector = LoseReplyOnce(url) if name=="lost_external_reply" else LocalTaskConnector(url)
            store=Store(workspace.root/".workbench"/"state.sqlite")
            try:
                if name=="bad_csv":
                    (workspace.input/"sales.csv").write_text("amount\nnot_a_number\n",encoding="utf-8")
                model=(EarlyFinish() if name=="premature_finish" else
                       ForbiddenTool() if name=="forbidden_tool" else FakeModel())
                engine=Engine(workspace,store,model,ToolRegistry(workspace,connector))
                followup=name in ("approve_followup","lost_external_reply","crash_remote_effect")
                if name in ("crash_file_effect","crash_remote_effect"):
                    if name=="crash_remote_effect":
                        engine.run(followup=True)  # asks approval
                        store.approve("demo-run","fake-create_followup","test-owner")
                    try:
                        engine.run(followup=followup,crash_after_effect=(
                            "write_artifact" if name=="crash_file_effect" else "create_followup"
                        ))
                    except SimulatedCrash:
                        pass
                    store.close()
                    store=Store(workspace.root/".workbench"/"state.sqlite")
                    engine=Engine(workspace,store,model,ToolRegistry(workspace,connector))
                    result=engine.run(followup=followup)
                elif name in ("approve_followup","lost_external_reply"):
                    first=engine.run(followup=True)
                    if first["status"] != "waiting":
                        raise RuntimeError("expected waiting for approval")
                    store.approve("demo-run","fake-create_followup","test-owner")
                    result=engine.run(followup=True)
                    if result["status"]=="needs_review":
                        result=engine.run(followup=True)
                else:
                    result=engine.run(followup=False,max_turns=1 if name=="budget_one_turn" else 12)
                actual=result["status"]
                expected=case["expected_status"]
                reasons=(result.get("acceptance") or {}).get("reasons",[])
                verdict=actual==expected
                if expected=="completed":
                    verdict &= result.get("acceptance",{}).get("passed",False)
                if case.get("expected_reason"):
                    verdict &= case["expected_reason"] in (reasons or [result.get("reason")])
                return {"case_id":case["id"],"mode":name,"passed":bool(verdict),
                        "actual_status":actual,"expected_status":expected,
                        "reasons":reasons,"external_writes":repo.count(),
                        "model_turns":store.run("demo-run")["turns"],
                        "events":len(store.events("demo-run")),
                        "duration_ms":round((perf_counter()-started)*1000,3),
                        "tokens":None}
            finally:
                store.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


def evaluate(dataset: Path, output: Path):
    cases=[json.loads(line) for line in dataset.read_text(encoding="utf-8").splitlines() if line.strip()]
    results=[]
    for case in cases:
        results.append(run_case(case))
    report={
        "dataset":str(dataset),"case_count":len(cases),
        "passed":sum(r["passed"] for r in results),
        "pass_rate":sum(r["passed"] for r in results)/len(results) if results else None,
        "median_duration_ms":median(r["duration_ms"] for r in results) if results else None,
        "live_model_evaluated":False,
        "warning":"Offline deterministic fake-model cases; NOT live-model production success rates.",
        "results":results,
    }
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    return report


def main(argv=None):
    ap=argparse.ArgumentParser()
    ap.add_argument("--dataset",type=Path,default=Path("evals/golden.jsonl"))
    ap.add_argument("--out",type=Path,default=Path("evals/reports/offline.json"))
    args=ap.parse_args(argv)
    report=evaluate(args.dataset,args.out)
    print(f"offline evaluation: {report['passed']}/{report['case_count']} passed")
    print(f"report: {args.out}")
    if report["passed"]!=report["case_count"]:
        raise SystemExit(1)

if __name__=="__main__":
    main()
