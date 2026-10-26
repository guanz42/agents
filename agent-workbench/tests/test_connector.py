import threading
import asyncio

import pytest
from workbench.connector import LocalTaskConnector
from workbench.demo_service import DemoTaskRepository, build_server
from workbench.orchestration import Job, layers, execute


def test_real_http_service_and_idempotency(tmp_path):
    repo=DemoTaskRepository(tmp_path/"remote.sqlite")
    server=build_server(repo,port=0)
    thread=threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    try:
        connector=LocalTaskConnector(f"http://127.0.0.1:{server.server_port}")
        assert len(connector.list_tasks()["items"])==2
        first=connector.create_followup("review","note","same-key")
        again=connector.create_followup("review","note","same-key")
        assert first==again
        assert connector.find_followup("same-key") == first["item"]
        assert repo.count()==1
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


def test_reject_remote_service_url():
    with pytest.raises(ValueError):
        LocalTaskConnector("http://example.com:8080")


def test_dag_layers_and_cycle():
    assert [[j.id for j in batch] for batch in layers([
        Job("read",frozenset()),Job("calc",frozenset()),
        Job("report",frozenset({"read","calc"}))
    ])] == [["calc","read"],["report"]]
    with pytest.raises(ValueError):
        layers([Job("a",frozenset({"b"})),Job("b",frozenset({"a"}))])


def test_optional_parallel_workers():
    async def worker(job):
        return {"ok":True,"value":job.id}
    outcome=asyncio.run(execute([
        Job("read",frozenset()),Job("calc",frozenset()),
        Job("report",frozenset({"read","calc"}))
    ],worker))
    assert outcome["status"]=="completed"
    assert outcome["completed"]["report"]=="report"
