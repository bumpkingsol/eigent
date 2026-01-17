from dataclasses import dataclass, field
from typing import Dict, List, Callable, Awaitable, Optional
from enum import Enum
from datetime import datetime
import asyncio
import logging
import uuid

logger = logging.getLogger(__name__)


class MessageType(str, Enum):
    """Enumeration of supported message types in the agent protocol.

    Attributes:
        REQUEST: A message expecting a response.
        RESPONSE: A response to a previous request.
        INFO: Informational message requiring no response.
        ERROR: Error report message.
    """

    REQUEST = "request"
    RESPONSE = "response"
    INFO = "info"
    ERROR = "error"


@dataclass
class AgentMessage:
    """Represents a message exchanged between agents.

    Attributes:
        sender (str): The identifier of the sending agent.
        recipient (str): The identifier of the receiving agent (or '*' for broadcast).
        message_type (MessageType): The type of the message.
        content (str): The body of the message.
        correlation_id (Optional[str]): ID to link requests and responses.
        timestamp (datetime): When the message was created.
    """

    sender: str
    recipient: str
    message_type: MessageType
    content: str
    correlation_id: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.now)


MessageHandler = Callable[[AgentMessage], Awaitable[None]]


class MessageBus:
    """Central message hub for agent communication.

    Manages subscriptions and message routing between agents in the system.
    """

    def __init__(self):
        """Initialize the message bus."""
        self._subscribers: Dict[str, List[MessageHandler]] = {}
        self._pending_responses: Dict[str, asyncio.Future] = {}

    def subscribe(self, agent_id: str, handler: MessageHandler):
        """Register a handler for a specific agent.

        Args:
            agent_id (str): The ID of the agent to subscribe.
            handler (MessageHandler): Async function to handle incoming messages.
        """
        if agent_id not in self._subscribers:
            self._subscribers[agent_id] = []
        self._subscribers[agent_id].append(handler)

    def unsubscribe(self, agent_id: str):
        """Remove all handlers for an agent.

        Args:
            agent_id (str): The ID of the agent to unsubscribe.
        """
        self._subscribers.pop(agent_id, None)

    async def send(self, message: AgentMessage):
        """Deliver a message to its recipient.

        If the recipient has multiple handlers, the message is sent to all of them.
        Exceptions in handlers are caught and logged to prevent bus crash.

        Args:
            message (AgentMessage): The message to send.
        """
        handlers = self._subscribers.get(message.recipient, [])
        for handler in handlers:
            try:
                await handler(message)
            except Exception:
                logger.exception("Error handling message %s -> %s", message.sender, message.recipient)

    async def broadcast(self, message: AgentMessage):
        """Send a message to all agents except the sender.

        Args:
            message (AgentMessage): The message to broadcast.
        """
        for agent_id, handlers in self._subscribers.items():
            if agent_id != message.sender:
                for handler in handlers:
                    try:
                        await handler(message)
                    except Exception:
                        logger.exception("Error handling broadcast %s -> %s", message.sender, agent_id)

    async def request(self, message: AgentMessage, timeout: float = 30.0) -> AgentMessage:
        """Send a message and wait for a response.

        Generates a correlation ID and waits for a matching response message.

        Args:
            message (AgentMessage): The request message.
            timeout (float): Max time to wait for response in seconds.

        Returns:
            AgentMessage: The response message.

        Raises:
            asyncio.TimeoutError: If no response is received within timeout.
        """
        correlation_id = str(uuid.uuid4())
        message.correlation_id = correlation_id

        # Use get_running_loop instead of get_event_loop for safety
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self._pending_responses[correlation_id] = future

        try:
            await self.send(message)
            return await asyncio.wait_for(future, timeout=timeout)
        finally:
            self._pending_responses.pop(correlation_id, None)

    async def respond(self, original: AgentMessage, response_content: str):
        """Send a response to a request message.

        Args:
            original (AgentMessage): The original request message.
            response_content (str): The content of the response.
        """
        if original.correlation_id and original.correlation_id in self._pending_responses:
            future = self._pending_responses[original.correlation_id]
            if not future.done():
                response = AgentMessage(
                    sender=original.recipient,
                    recipient=original.sender,
                    message_type=MessageType.RESPONSE,
                    content=response_content,
                    correlation_id=original.correlation_id,
                )
                future.set_result(response)
