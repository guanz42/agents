"""Run with python -m workbench.cli; keeps sensitive actions opt-in."""
import argparse
import json
import os
from pathlib import Path

from .connector import LocalTaskConnector
from .demo_service import serve
from .engine import Engine
from .models import FakeModel, OpenAIChatModel
from .state import Store
from .tools import ToolRegistry
from .workspace import Workspace


def init_demo(root: Path):
    (root/"input").mkdir(parents=True,exist_ok=True)
    (root/"artifacts").mkdir(parents=True,exist_ok=True)
    source={
        "notes.md": "本周完成项目联调，待解决问题：报告字段需校验。\n",
        "sales.csv": "date,amount\n2026-10-01,0.10\n2026-10-02,0.20\n"
    }
    for name,text in source.items():
        path=root/"input"/name
        if not path.exists():
            path.write_text(text,encoding="utf-8")
    print("initialized:",root)


def main(argv=None):
    parser=argparse.ArgumentParser(prog="workbench")
    subs=parser.add_subparsers(dest="action",required=True)
    a=subs.add_parser("init-demo");a.add_argument("workspace",type=Path)
    b=subs.add_parser("serve-demo");b.add_argument("--db",type=Path,default=Path("demo-tasks.sqlite"));b.add_argument("--port",type=int,default=8765)
    c=subs.add_parser("run")
    c.add_argument("workspace",type=Path)
    c.add_argument("--run-id",default="demo-run");c.add_argument("--task-id",default="demo-task")
    c.add_argument("--user-id",default="local-user");c.add_argument("--followup",action="store_true")
    c.add_argument("--service",default="http://127.0.0.1:8765")
    c.add_argument("--live",action="store_true");c.add_argument("--model",default=None)
    c.add_argument("--crash-after-effect",choices=["write_artifact","create_followup"])
    d=subs.add_parser("approve")
    d.add_argument("workspace",type=Path);d.add_argument("--run-id",default="demo-run")
    d.add_argument("--approver",required=True)
    e=subs.add_parser("trace")
    e.add_argument("workspace",type=Path);e.add_argument("--run-id",default="demo-run")
    args=parser.parse_args(argv)
    if args.action=="init-demo":
        return init_demo(args.workspace)
    if args.action=="serve-demo":
        return serve(args.db,args.port)

    root=args.workspace.resolve()
    store=Store(root/".workbench"/"state.sqlite")
    try:
        if args.action=="approve":
            pending=store.pending_approval(args.run_id)
            if pending is None:
                raise SystemExit("no pending external write")
            print("approving this exact operation:",pending["name"],pending["arguments"])
            store.approve(args.run_id,pending["call_id"],args.approver)
            print("approval saved; rerun with the same run ID and --followup")
        elif args.action=="trace":
            for event in store.events(args.run_id):
                print(json.dumps(event,ensure_ascii=False))
        elif args.action=="run":
            workspace=Workspace(root)
            connector=LocalTaskConnector(args.service)
            if args.live:
                if not args.model or not os.environ.get("OPENAI_API_KEY"):
                    raise SystemExit("set OPENAI_API_KEY and --model to use live provider")
                model=OpenAIChatModel(args.model,os.environ["OPENAI_API_KEY"],os.getenv("OPENAI_BASE_URL"))
            else:
                model=FakeModel()
            engine=Engine(workspace,store,model,ToolRegistry(workspace,connector))
            result=engine.run(run_id=args.run_id,task_id=args.task_id,user_id=args.user_id,
                              followup=args.followup,crash_after_effect=args.crash_after_effect)
            print(json.dumps(result,ensure_ascii=False,indent=2))
    finally:
        store.close()


if __name__=="__main__":
    main()
