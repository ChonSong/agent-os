"""Async JSONL logger — compatible with existing ObservabilityPanel."""
from __future__ import annotations
import asyncio
import json
from pathlib import Path
from typing import Any


class AIELogger:
    """Appends JSONL AIE events to a log file."""

    def __init__(self, log_path: str = "/opt/data/aie-logs/agent-events.jsonl"):
        self.log_path = Path(log_path)
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()

    async def log(self, event: dict[str, Any]) -> None:
        """Append a JSONL event."""
        line = json.dumps(event, ensure_ascii=False) + "\n"
        async with self._lock:
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(line)

    def log_sync(self, event: dict[str, Any]) -> None:
        """Sync variant for non-async contexts."""
        line = json.dumps(event, ensure_ascii=False) + "\n"
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(line)
