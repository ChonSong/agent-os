"""AIE AgentHook that emits TOOL_CALL and TASK_COMPLETE events."""
from __future__ import annotations


from nanobot.agent.hook import AgentHook, AgentHookContext

from .events import AIEEvent, EventType


class AIEAgentHook(AgentHook):
    """AgentHook that logs TOOL_CALL and TASK_COMPLETE events.

    Args:
        logger: Any object with an async ``log(event: dict)`` method.
               AIELogger (JSONL) and RemoteAIEventsLogger are both compatible.
        log_path: Deprecated. Use ``logger`` arg with an explicit AIELogger instead.
    """

    def __init__(self, logger=None, log_path: str | None = None) -> None:
        super().__init__()
        if logger is not None:
            self._logger = logger
        elif log_path:
            from .logger import AIELogger
            self._logger = AIELogger(log_path=log_path)
        else:
            from .logger import AIELogger
            self._logger = AIELogger()

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
