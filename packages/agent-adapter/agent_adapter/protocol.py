"""Agent adapter protocol — abstract interface for all agents."""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator


@dataclass
class AgentResponse:
    content: str
    tools_used: list[str] = field(default_factory=list)
    messages: list[dict] = field(default_factory=list)


class AgentAdapter(ABC):
    """Abstract base for all agent backends."""

    @abstractmethod
    async def run(self, message: str, session: str) -> AgentResponse:
        """Run a single-shot agent query."""

    @abstractmethod
    async def stream(self, message: str, session: str) -> AsyncIterator[str]:
        """Run an agent query with streaming output."""

    @abstractmethod
    async def health(self) -> bool:
        """Return True if the agent is reachable and ready."""
