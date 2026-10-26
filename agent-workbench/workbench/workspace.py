from __future__ import annotations

import csv
import hashlib
import os
from decimal import Decimal, InvalidOperation
from pathlib import Path


class Workspace:
    """Application-layer workspace guard; NOT an OS sandbox or TOCTOU-safe."""

    def __init__(self, root: Path):
        self.root = root.resolve()
        self.input = (self.root / "input").resolve()
        self.artifacts = (self.root / "artifacts").resolve()
        if not self.input.is_dir() or not self.artifacts.is_dir():
            raise ValueError("initialize input/ and artifacts/ before running")

    @staticmethod
    def _checked(base: Path, relative: str) -> Path:
        if not isinstance(relative, str) or not relative or Path(relative).is_absolute():
            raise PermissionError("invalid relative path")
        target = (base / relative).resolve()
        if not target.is_relative_to(base):
            raise PermissionError("outside authorized directory")
        return target

    def read(self, relative: str) -> str:
        path = self._checked(self.input, relative)
        if not path.is_file() or path.stat().st_size > 1_000_000:
            raise ValueError("missing or oversized input")
        return path.read_text(encoding="utf-8")

    def calculate(self, relative: str) -> dict:
        path = self._checked(self.input, relative)
        if not path.is_file() or path.stat().st_size > 1_000_000:
            raise ValueError("missing or oversized csv")
        with path.open(encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)
            if not reader.fieldnames or "amount" not in reader.fieldnames:
                raise ValueError("CSV must include amount column")
            total, count = Decimal("0"), 0
            for row_number, row in enumerate(reader, 2):
                try:
                    value = Decimal(row["amount"] or "")
                except (InvalidOperation, TypeError, KeyError) as exc:
                    raise ValueError(f"invalid amount at line {row_number}") from exc
                if not value.is_finite():
                    raise ValueError(f"nonfinite amount at line {row_number}")
                total += value
                count += 1
        return {"source": relative, "count": count, "total": str(total)}

    def write_artifact(self, relative: str, content: str) -> dict:
        path = self._checked(self.artifacts, relative)
        if not path.parent.is_dir():
            raise ValueError("artifact parent directory missing")
        data = content.encode("utf-8")
        if len(data) > 1_000_000:
            raise ValueError("artifact exceeds size budget")
        # This protects against sequential duplicate writes; not against hostile local races.
        if path.exists():
            if path.is_file() and path.read_bytes() == data:
                return {"path": relative, "sha256": hashlib.sha256(data).hexdigest(), "reused": True}
            raise FileExistsError("artifact already exists with different content")
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        fd = os.open(str(path), flags, 0o600)
        try:
            with os.fdopen(fd, "wb") as fh:
                fd = -1
                fh.write(data)
                fh.flush()
                os.fsync(fh.fileno())
        finally:
            if fd >= 0:
                os.close(fd)
        return {"path": relative, "sha256": hashlib.sha256(data).hexdigest(), "reused": False}

    def snapshot_inputs(self) -> dict[str, str]:
        return {
            p.relative_to(self.input).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(self.input.rglob("*")) if p.is_file()
        }
