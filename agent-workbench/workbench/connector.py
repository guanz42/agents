"""HTTP boundary used by the local demo service; intentionally localhost-only."""
import json
from urllib.request import Request, urlopen
from urllib.parse import urlparse


class OutcomeUnknown(Exception):
    """An external side-effect may have occurred but the result was lost."""


class LocalTaskConnector:
    def __init__(self, base_url: str, timeout: float = 2.0):
        parsed = urlparse(base_url)
        if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost"):
            raise ValueError("teaching connector permits only local HTTP demo service")
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("invalid demo service URL")
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _get(self, route: str):
        with urlopen(self.base_url + route, timeout=self.timeout) as response:
            return json.load(response)

    def list_tasks(self):
        return self._get("/tasks")

    def find_followup(self, idempotency_key: str):
        from urllib.parse import quote
        data = self._get("/followups/by-key/" + quote(idempotency_key, safe=""))
        return data.get("item")

    def create_followup(self, title: str, note: str, idempotency_key: str):
        body = json.dumps({"title": title, "note": note, "idempotency_key": idempotency_key}).encode()
        req = Request(self.base_url + "/followups", data=body,
                      headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urlopen(req, timeout=self.timeout) as response:
                return json.load(response)
        except Exception as exc:
            # Including protocol/network errors: never claim side effect definitely failed.
            raise OutcomeUnknown("external write returned no confirmed result") from exc
