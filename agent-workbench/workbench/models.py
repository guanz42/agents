"""Models return normalized Chat Completions-compatible assistant messages.

FakeModel supports deterministic offline tests. OpenAIChatModel is an OPTIONAL
adapter for a real provider; no live provider behavior is asserted by tests.
"""
import json
from typing import Protocol


class Model(Protocol):
    def reply(self, messages: list[dict], tools: list[dict], *, followup: bool) -> dict: ...


def tool_call(name: str, arguments: dict) -> dict:
    return {"id": f"fake-{name}", "type": "function", "function": {
        "name": name, "arguments": json.dumps(arguments, ensure_ascii=False)
    }}


class FakeModel:
    """Deterministic simulated planner for the integrated project fixture."""

    def reply(self, messages: list[dict], tools: list[dict], *, followup: bool) -> dict:
        tool_names = {}
        for msg in messages:
            if msg["role"] == "assistant":
                for c in msg.get("tool_calls", []):
                    tool_names[c["id"]] = c["function"]["name"]
        results = {}
        for msg in messages:
            if msg["role"] == "tool":
                results[tool_names[msg["tool_call_id"]]] = json.loads(msg["content"])
        for name, args in [
            ("read_file", {"path": "notes.md"}),
            ("calculate_csv", {"path": "sales.csv"}),
            ("fetch_tasks", {}),
        ]:
            if name not in results:
                return {"role": "assistant", "content": "", "tool_calls": [tool_call(name, args)]}
            if not results[name]["ok"]:
                return {"role": "assistant", "content": "工具处理失败：" + name}
        if "write_artifact" not in results:
            note = results["read_file"]["value"]["text"]
            metrics = results["calculate_csv"]["value"]
            task_items = results["fetch_tasks"]["value"]["items"]
            todos = "\n".join("- " + item["title"] for item in task_items)
            report = (
                "# 工作报告\n## 进展\n" + note + "\n"
                + "## 数据分析\n金额合计：" + metrics["total"] + "\n"
                + "## 风险\n需核对跨系统任务状态。\n"
                + "## 待办\n" + todos + "\n"
                + "## 数据来源\n- input/notes.md\n- input/sales.csv\n- external/tasks\n"
            )
            return {"role": "assistant", "content": "", "tool_calls": [tool_call(
                "write_artifact", {"path": "report.md", "content": report}
            )]}
        if not results["write_artifact"]["ok"]:
            return {"role": "assistant", "content": "报告写入失败"}
        if followup:
            if "create_followup" not in results:
                return {"role": "assistant", "content": "", "tool_calls": [tool_call(
                    "create_followup", {"title": "核对本周数据", "note": "由 Agent 生成的待办草稿"}
                )]}
            if not results["create_followup"]["ok"]:
                return {"role": "assistant", "content": "外部事项创建失败"}
        return {"role": "assistant", "content": "报告已经生成；请查看 artifacts/report.md。"}


class OpenAIChatModel:
    """Live adapter. SDK is optional: pip install -e '.[live]'.

    Strictly uses Chat Completions tool calling. A compatible model must support
    tools and preserve tool_call_id. Provider-specific support varies.
    """

    def __init__(self, model_name: str, api_key: str, base_url: str | None = None):
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise RuntimeError("install optional dependency: pip install -e '.[live]'") from exc
        kwargs = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        self.client = OpenAI(**kwargs)
        self.model_name = model_name

    def reply(self, messages: list[dict], tools: list[dict], *, followup: bool) -> dict:
        resp = self.client.chat.completions.create(
            model=self.model_name, messages=messages, tools=tools, tool_choice="auto"
        )
        if not resp.choices:
            raise RuntimeError("empty model response")
        msg = resp.choices[0].message
        result = {"role": "assistant", "content": msg.content or ""}
        if msg.tool_calls:
            calls = []
            for item in msg.tool_calls:
                if item.type != "function":
                    raise ValueError("unsupported tool type")
                # Validates JSON syntax only; ToolRegistry validates semantics.
                args = json.loads(item.function.arguments)
                if not isinstance(args, dict):
                    raise ValueError("tool argument must be JSON object")
                calls.append({"id": item.id, "type": "function", "function": {
                    "name": item.function.name, "arguments": item.function.arguments
                }})
            result["tool_calls"] = calls
        return result
