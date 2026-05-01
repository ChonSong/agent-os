"""Agent-agnostic adapter — swap nanobot for any agent without changing the dashboard."""

from .protocol import AgentResponse, AgentAdapter
from .nanobot_adapter import NanobotAdapter

__all__ = ["AgentResponse", "AgentAdapter", "NanobotAdapter"]
