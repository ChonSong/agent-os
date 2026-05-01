import pytest
from agent_adapter.protocol import AgentResponse


def test_agent_response_defaults():
    r = AgentResponse(content="hello")
    assert r.content == "hello"
    assert r.tools_used == []
    assert r.messages == []
