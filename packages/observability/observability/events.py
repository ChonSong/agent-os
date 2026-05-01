"""AIE event types matching the existing observability panel."""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class EventType(str, Enum):
    DELEGATION = "delegation"
    TOOL_CALL = "tool_call"
    ASSUMPTION = "assumption"
    DRIFT = "drift"
    CIRCUIT_OPEN = "circuit_open"
    TASK_COMPLETE = "task_complete"


@dataclass
class AIEEvent:
    type: EventType
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    data: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type.value,
            "timestamp": self.timestamp,
            "data": self.data,
        }
