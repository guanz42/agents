from pathlib import Path
import pytest
from workbench.workspace import Workspace
from workbench.cli import init_demo


@pytest.fixture
def workspace(tmp_path):
    init_demo(tmp_path)
    return Workspace(tmp_path)


class DummyConnector:
    def __init__(self):
        self.followups = {}
        self.writes = 0
        self.drop_reply_once = False

    def list_tasks(self):
        return {"items":[{"id":"t1","title":"补充数据验收"}]}

    def find_followup(self,key):
        return self.followups.get(key)

    def create_followup(self,title,note,idempotency_key):
        from workbench.connector import OutcomeUnknown
        if idempotency_key not in self.followups:
            self.followups[idempotency_key]={"title":title,"note":note,"id":idempotency_key}
            self.writes+=1
        if self.drop_reply_once:
            self.drop_reply_once=False
            raise OutcomeUnknown("fake lost response")
        return {"item":self.followups[idempotency_key]}


@pytest.fixture
def connector():
    return DummyConnector()
