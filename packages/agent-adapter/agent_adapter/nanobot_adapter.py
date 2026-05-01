"""Nanobot adapter — wraps ChonSong/nanobot as an AgentAdapter."""
from __future__ import annotations
import httpx
from typing import AsyncIterator

from .protocol import AgentAdapter, AgentResponse


class NanobotAdapter(AgentAdapter):
    """Calls nanobot via its OpenAI-compatible /v1/chat/completions API."""

    def __init__(
        self,
        base_url: str = "http://localhost:8001",
        api_key: str = "nanobot-internal",
        model: str = "claude-sonnet-4-6",
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model

    async def run(self, message: str, session: str = "default") -> AgentResponse:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self.base_url}/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": message}],
                    "stream": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            choice = data["choices"][0]["message"]
            return AgentResponse(
                content=choice.get("content", ""),
                tools_used=[],  # extracted from response if available
                messages=data.get("messages", []),
            )

    async def stream(self, message: str, session: str = "default") -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": message}],
                    "stream": True,
                },
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        import json as _json
                        if line.strip() == "data: [DONE]":
                            break
                        try:
                            chunk = _json.loads(line[6:])
                            delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if delta:
                                yield delta
                        except Exception:
                            pass

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/health")
                return resp.status_code == 200
        except Exception:
            return False
