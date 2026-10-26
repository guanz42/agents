from .workspace import Workspace


def grade(workspace: Workspace, input_hashes: dict, *, followup: bool, external_item: dict | None = None) -> dict:
    reasons = []
    report = workspace.artifacts / "report.md"
    if not report.is_file():
        reasons.append("report_missing")
    else:
        body = report.read_text(encoding="utf-8")
        for section in ("## 进展", "## 风险", "## 待办", "## 数据来源"):
            if section not in body:
                reasons.append("missing_section:" + section)
        try:
            expected = workspace.calculate("sales.csv")["total"]
        except (ValueError, PermissionError):
            reasons.append("metric_recompute_failed")
        else:
            if f"金额合计：{expected}" not in body:
                reasons.append("incorrect_total")
    if workspace.snapshot_inputs() != input_hashes:
        reasons.append("original_sources_modified")
    if followup and external_item is None:
        reasons.append("followup_unconfirmed")
    return {"passed": not reasons, "reasons": reasons}
