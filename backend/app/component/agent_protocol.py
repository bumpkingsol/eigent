from dataclasses import dataclass, field
from typing import Dict, List, Callable, Awaitable, Optional
from enum import Enum
from datetime import datetime
import asyncio


class MessageType(str, Enum):
    REQUEST = "request"
    RESPONSE = "response"
    INFO = "info"
    ERROR = "error"


@dataclass
class AgentMessage:
    sender: str
    recipient: str
    message_type: MessageType
    content: str
    correlation_id: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.now)


MessageHandler = Callable[[AgentMessage], Awaitable[None]]


class MessageBus:
    def __init__(self):
        self._subscribers: Dict[str, List[MessageHandler]] = {}
        self._pending_responses: Dict[str, asyncio.Future] = {}

    def subscribe(self, agent_id: str, handler: MessageHandler):
        if agent_id not in self._subscribers:
            self._subscribers[agent_id] = []
        self._subscribers[agent_id].append(handler)

    def unsubscribe(self, agent_id: str):
        self._subscribers.pop(agent_id, None)

    async def send(self, message: AgentMessage):
        handlers = self._subscribers.get(message.recipient, [])
        for handler in handlers:
            await handler(message)

    async def broadcast(self, message: AgentMessage):
        for agent_id, handlers in self._subscribers.items():
            if agent_id != message.sender:
                for handler in handlers:
                    await handler(message)

    async def request(self, message: AgentMessage, timeout: float = 30.0) -> AgentMessage:
        import uuid

        correlation_id = str(uuid.uuid4())
        message.correlation_id = correlation_id

        future = asyncio.get_event_loop().create_future()
        self._pending_responses[correlation_id] = future

        try:
            await self.send(message)
            return await asyncio.wait_for(future, timeout=timeout)
        finally:
            self._pending_responses.pop(correlation_id, None)

    async def respond(self, original: AgentMessage, response_content: str):
        if original.correlation_id and original.correlation_id in self._pending_responses:
            response = AgentMessage(
                sender=original.recipient,
                recipient=original.sender,
                message_type=MessageType.RESPONSE,
                content=response_content,
                correlation_id=original.correlation_id,
            )
            self._pending_responses[original.correlation_id].set_result(response)
