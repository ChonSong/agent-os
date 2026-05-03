"""AIE AgentHook that emits TOOL_CALL and TASK_COMPLETE events."""
from __future__ import annotations


from nanobot.agent.hook import AgentHook, AgentHookContext

from .events import AIEEvent, EventType
from .logger import AIELogger


class AIEAgentHook(AgentHook):
    """AgentHook that logs TOOL_CALL and TASK_COMPLETE events via AIELogger."""

    def __init__(self, log_path: str | None = None) -> None:
        super().__init__()
        self._logger = AIELogger(log_path=log_path) if log_path else AIELogger()

    async def before_execute_tools(self, context: AgentHookContext) -> None:
        """Emit a TOOL_CALL event for each tool call in the context."""
        for tool_call in context.tool_calls:
            event = AIEEvent(
                type=EventType.TOOL_CALL,
                data={
                    "tool_name": tool_call.name,
                    "tool_args": tool_call.arguments,
                    "iteration": context.iteration,
                },
            )
            await self._logger.log(event.to_dict())

    async def after_iteration(self, context: AgentHookContext) -> None:
        """Emit a TASK_COMPLETE event when the agent run finishes."""
        event = AIEEvent(
            type=EventType.TASK_COMPLETE,
            data={
                "iteration": context.iteration,
                "final_content": context.final_content,
                "stop_reason": context.stop_reason,
                "error": context.error,
            },
        )
        await self._logger.log(event.to_dict())
