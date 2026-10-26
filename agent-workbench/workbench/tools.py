"""Named capability registry; Model output is never executable Python or shell."""
from dataclasses import dataclass
from typing import Callable

from .workspace import Workspace


class ToolRejected(Exception):
    pass


@dataclass(frozen=True)
class ToolSpec:
    name: str
    scope: str
    fields: tuple[str, ...]
    description: str
    require_approval: bool = False

    def schema(self):
        return {"type": "function", "function": {
            "name": self.name, "description": self.description,
            "parameters": {"type": "object", "properties": {
                field: {"type": "string"} for field in self.fields
            }, "required": list(self.fields), "additionalProperties": False}
        }}


SPECS = [
    ToolSpec("read_file", "file:read", ("path",), "Read an authorized input file."),
    ToolSpec("calculate_csv", "file:read", ("path",), "Sum CSV amount column exactly."),
    ToolSpec("fetch_tasks", "external:read", (), "List tasks from the local demo service."),
    ToolSpec("write_artifact", "artifact:create", ("path", "content"), "Create a report in artifacts."),
    ToolSpec("create_followup", "external:write", ("title", "note"),
             "Create a followup in the demo task service after explicit user approval.", True),
]


class ToolRegistry:
    def __init__(self, workspace: Workspace, connector, scopes: set[str] | None = None):
        self.workspace = workspace
        self.connector = connector
        self.scopes = scopes if scopes is not None else {
            "file:read", "artifact:create", "external:read", "external:write"
        }
        self.specs = {s.name:s for s in SPECS}

    def schemas(self) -> list[dict]:
        return [spec.schema() for spec in SPECS if spec.scope in self.scopes]

    def validate(self, name: str, arguments: dict):
        spec=self.specs.get(name)
        if spec is None:
            raise ToolRejected("unknown_tool")
        if not isinstance(arguments, dict) or set(arguments) != set(spec.fields):
            raise ToolRejected("invalid_arguments")
        if not all(isinstance(arguments[field], str) for field in spec.fields):
            raise ToolRejected("invalid_arguments")
        if spec.scope not in self.scopes:
            raise ToolRejected("permission_denied")
        return spec

    def execute(self, name: str, args: dict, *, idempotency_key: str):
        self.validate(name,args)
        if name == "read_file":
            return {"text": self.workspace.read(args["path"]), "source": "input/" + args["path"]}
        if name == "calculate_csv":
            return self.workspace.calculate(args["path"])
        if name == "fetch_tasks":
            return self.connector.list_tasks()
        if name == "write_artifact":
            return self.workspace.write_artifact(args["path"],args["content"])
        if name == "create_followup":
            return self.connector.create_followup(args["title"], args["note"], idempotency_key)
        raise AssertionError("registry mismatch")
