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


class RemoteAIEventsLogger:
    """Posts AIE events to a remote HTTP endpoint (e.g. agent-os backend).

    Falls back silently on network errors so agent runs are never blocked.
    Optionally also writes to a local JSONL file.
    """

    def __init__(
        self,
        endpoint: str,
        log_path: str | None = None,
        session_key: str = "observability",
        timeout_s: float = 5.0,
    ):
        self.endpoint = endpoint.rstrip("/")
        self.log_path = Path(log_path) if log_path else None
        self.session_key = session_key
        self.timeout_s = timeout_s
        self._lock = asyncio.Lock()
        if self.log_path:
            self.log_path.parent.mkdir(parents=True, exist_ok=True)

    async def log(self, event: dict[str, Any]) -> None:
        """Log to local file AND POST to remote endpoint (fire-and-forget)."""
        # Always write locally
        if self.log_path:
            line = json.dumps(event, ensure_ascii=False) + "\n"
            async with self._lock:
                with open(self.log_path, "a", encoding="utf-8") as f:
                    f.write(line)

        # POST to backend (fire-and-forget, never blocks agent)
        payload = {
            "session_key": self.session_key,
            "event": event,
        }
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.endpoint,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=self.timeout_s),
                    headers={"Content-Type": "application/json"},
                ) as resp:
                    if resp.status >= 500:
                        pass  # backend unavailable — silent
                    elif resp.status >= 400:
                        pass  # bad request — silent
        except Exception:
            pass  # network error — silent, local log already written

    def log_sync(self, event: dict[str, Any]) -> None:
        """Sync variant — writes locally only."""
        if self.log_path:
            line = json.dumps(event, ensure_ascii=False) + "\n"
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(line)
