"""Local-only fake enterprise task app with persisted idempotency semantics."""
import json
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote


class DemoTaskRepository:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True,exist_ok=True)
        with self._db() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS followups(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                idem_key TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL, note TEXT NOT NULL
            )""")

    def _db(self):
        db=sqlite3.connect(self.path,timeout=3)
        db.row_factory=sqlite3.Row
        return db

    def find(self,key):
        with self._db() as db:
            row=db.execute("SELECT * FROM followups WHERE idem_key=?",(key,)).fetchone()
            return dict(row) if row else None

    def create(self, key, title, note):
        with self._db() as db:
            db.execute("INSERT OR IGNORE INTO followups(idem_key,title,note) VALUES(?,?,?)",(key,title,note))
            row=db.execute("SELECT * FROM followups WHERE idem_key=?",(key,)).fetchone()
            if row["title"]!=title or row["note"]!=note:
                raise ValueError("idempotency key reused for different arguments")
            return dict(row)

    def count(self):
        with self._db() as db:
            return db.execute("SELECT COUNT(*) FROM followups").fetchone()[0]


def build_server(repo: DemoTaskRepository, port=8765):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

        def send(self, code, value):
            body=json.dumps(value,ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header("Content-Type","application/json")
            self.send_header("Content-Length",str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path=="/tasks":
                return self.send(200,{"items":[
                    {"id":"task-100","title":"检查接口联调结果"},
                    {"id":"task-101","title":"补充数据验收"}
                ]})
            if self.path.startswith("/followups/by-key/"):
                key=unquote(self.path.split("/followups/by-key/",1)[1])
                return self.send(200,{"item":repo.find(key)})
            return self.send(404,{"error":"not_found"})

        def do_POST(self):
            if self.path!="/followups":
                return self.send(404,{"error":"not_found"})
            length=int(self.headers.get("Content-Length","0"))
            if length > 8192:
                return self.send(413,{"error":"payload_too_large"})
            try:
                payload=json.loads(self.rfile.read(length))
                if (set(payload)!={"title","note","idempotency_key"}
                    or not all(isinstance(v,str) and v for v in payload.values())):
                    raise ValueError("invalid_payload")
                item=repo.create(payload["idempotency_key"],payload["title"],payload["note"])
            except (ValueError,sqlite3.Error):
                return self.send(400,{"error":"invalid_request"})
            return self.send(200,{"item":item})

    return ThreadingHTTPServer(("127.0.0.1",port),Handler)


def serve(path: Path, port: int=8765):
    server=build_server(DemoTaskRepository(path),port)
    print(f"Demo task service at http://127.0.0.1:{server.server_port}",flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
