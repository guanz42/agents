import hashlib
import json
import sqlite3
from pathlib import Path


def canonical(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA busy_timeout=3000")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS runs (
          run_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, user_id TEXT NOT NULL,
          goal TEXT NOT NULL, followup INTEGER NOT NULL, status TEXT NOT NULL,
          messages TEXT NOT NULL, turns INTEGER NOT NULL DEFAULT 0,
          input_hashes TEXT NOT NULL, final_answer TEXT, error TEXT
        );
        CREATE TABLE IF NOT EXISTS intents (
          run_id TEXT NOT NULL, call_id TEXT NOT NULL, name TEXT NOT NULL,
          arguments TEXT NOT NULL, arg_digest TEXT NOT NULL,
          state TEXT NOT NULL, authorized INTEGER NOT NULL DEFAULT 0,
          result TEXT, PRIMARY KEY (run_id, call_id)
        );
        CREATE TABLE IF NOT EXISTS approvals (
          run_id TEXT NOT NULL, call_id TEXT NOT NULL,
          digest TEXT NOT NULL, approver TEXT NOT NULL,
          consumed INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (run_id, call_id)
        );
        CREATE TABLE IF NOT EXISTS events (
          seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL,
          kind TEXT NOT NULL, detail TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """)
        self.db.commit()

    def close(self):
        self.db.close()

    def run(self, run_id: str):
        row = self.db.execute("SELECT * FROM runs WHERE run_id=?", (run_id,)).fetchone()
        return dict(row) if row else None

    def create_run(self, run_id, task_id, user_id, goal, followup, snapshots):
        with self.db:
            self.db.execute("""INSERT INTO runs(run_id,task_id,user_id,goal,followup,status,messages,input_hashes)
                VALUES(?,?,?,?,?,'running',?,?)""", (
                run_id, task_id, user_id, goal, int(followup),
                canonical([{"role": "system", "content": "You are a work assistant. Use only authorized tools. Produce a verified report."},
                           {"role": "user", "content": goal}]), canonical(snapshots)))
        self.event(run_id, "run.created", "")

    def checkpoint(self, run_id: str, messages: list, *, turns: int | None = None, status: str | None = None, answer: str | None = None, error: str | None = None):
        values = [canonical(messages)]
        expr = ["messages=?"]
        if turns is not None:
            expr.append("turns=?"); values.append(turns)
        if status is not None:
            expr.append("status=?"); values.append(status)
        if answer is not None:
            expr.append("final_answer=?"); values.append(answer)
        if error is not None:
            expr.append("error=?"); values.append(error)
        values.append(run_id)
        with self.db:
            self.db.execute(f"UPDATE runs SET {', '.join(expr)} WHERE run_id=?", values)

    def event(self, run_id, kind, detail=""):
        with self.db:
            self.db.execute("INSERT INTO events(run_id,kind,detail) VALUES (?,?,?)", (run_id,kind,detail[:400]))

    def intent(self, run_id, call_id, name, args):
        signature = digest({"name":name,"args":args})
        with self.db:
            self.db.execute("""INSERT OR IGNORE INTO intents(run_id,call_id,name,arguments,arg_digest,state)
                VALUES(?,?,?,?,?,'pending')""", (run_id,call_id,name,canonical(args),signature))
        row = self.db.execute("SELECT * FROM intents WHERE run_id=? AND call_id=?", (run_id,call_id)).fetchone()
        if row["arg_digest"] != signature or row["name"] != name:
            raise ValueError("tool call id reused with different arguments")
        return dict(row)

    def intent_row(self, run_id, call_id):
        row = self.db.execute("SELECT * FROM intents WHERE run_id=? AND call_id=?",(run_id,call_id)).fetchone()
        return dict(row) if row else None

    def mark_started(self, run_id, call_id):
        with self.db:
            self.db.execute("UPDATE intents SET state='started' WHERE run_id=? AND call_id=?",(run_id,call_id))

    def mark_complete(self, run_id, call_id, result):
        with self.db:
            self.db.execute("UPDATE intents SET state='done',result=? WHERE run_id=? AND call_id=?",(canonical(result),run_id,call_id))

    def pending_approval(self, run_id):
        row=self.db.execute("""SELECT * FROM intents WHERE run_id=? AND name='create_followup'
           AND state != 'done' ORDER BY rowid LIMIT 1""",(run_id,)).fetchone()
        return dict(row) if row else None

    def approve(self, run_id, call_id, approver: str):
        row = self.intent_row(run_id,call_id)
        if row is None or row["name"] != "create_followup" or row["state"] == "done":
            raise ValueError("no pending high-risk operation")
        with self.db:
            self.db.execute("""INSERT OR IGNORE INTO approvals(run_id,call_id,digest,approver)
                VALUES(?,?,?,?)""", (run_id,call_id,row["arg_digest"],approver))
        self.event(run_id,"approval.granted",f"{call_id}, approver={approver}")

    def consume_approval(self, run_id, call_id):
        with self.db:
            intent = self.db.execute("SELECT * FROM intents WHERE run_id=? AND call_id=?",(run_id,call_id)).fetchone()
            if intent is None:
                return False
            if intent["authorized"]:
                return True  # persisted approval for this exact immutable intent
            approval=self.db.execute("""SELECT * FROM approvals WHERE run_id=? AND call_id=?
                AND digest=? AND consumed=0""",(run_id,call_id,intent["arg_digest"])).fetchone()
            if approval is None:
                return False
            c=self.db.execute("""UPDATE approvals SET consumed=1 WHERE run_id=? AND call_id=? AND consumed=0""",(run_id,call_id))
            if c.rowcount != 1:
                return False
            self.db.execute("UPDATE intents SET authorized=1 WHERE run_id=? AND call_id=?",(run_id,call_id))
            return True

    def events(self, run_id):
        return [dict(r) for r in self.db.execute("SELECT * FROM events WHERE run_id=? ORDER BY seq",(run_id,))]
