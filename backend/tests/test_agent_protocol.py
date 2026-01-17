import pytest
from app.component.agent_protocol import AgentMessage, MessageBus, MessageType


@pytest.mark.asyncio
async def test_message_bus_routes_to_recipient():
    bus = MessageBus()
    received = []

    async def handler(msg: AgentMessage):
        received.append(msg)

    bus.subscribe("browser_agent", handler)

    await bus.send(
        AgentMessage(
            sender="developer_agent",
            recipient="browser_agent",
            message_type=MessageType.REQUEST,
            content="Please find the API documentation for pandas",
        )
    )

    assert len(received) == 1
    assert received[0].content == "Please find the API documentation for pandas"


@pytest.mark.asyncio
async def test_message_bus_broadcasts_to_all():
    bus = MessageBus()
    received_a = []
    received_b = []

    async def handler_a(msg):
        received_a.append(msg)

    async def handler_b(msg):
        received_b.append(msg)

    bus.subscribe("agent_a", handler_a)
    bus.subscribe("agent_b", handler_b)

    await bus.broadcast(
        AgentMessage(
            sender="orchestrator", recipient="*", message_type=MessageType.INFO, content="Task priority has changed"
        )
    )

    assert len(received_a) == 1
    assert len(received_b) == 1


@pytest.mark.asyncio
async def test_request_response_cycle():
    bus = MessageBus()

    async def echo_handler(msg: AgentMessage):
        if msg.message_type == MessageType.REQUEST:
            await bus.respond(msg, f"Echo: {msg.content}")

    bus.subscribe("responder", echo_handler)

    request = AgentMessage(sender="requester", recipient="responder", message_type=MessageType.REQUEST, content="Hello")

    response = await bus.request(request, timeout=1.0)

    assert response.content == "Echo: Hello"
    assert response.sender == "responder"
    assert response.recipient == "requester"
    assert response.correlation_id == request.correlation_id


@pytest.mark.asyncio
async def test_handler_error_safety():
    """Ensure that a failing handler doesn't prevent others from running or crash the bus."""
    bus = MessageBus()
    received = []

    async def crashing_handler(msg):
        raise ValueError("Intentional crash")

    async def safe_handler(msg):
        received.append(msg)

    # Subscribe both to the same agent_id
    bus.subscribe("recipient", crashing_handler)
    bus.subscribe("recipient", safe_handler)

    msg = AgentMessage(sender="sender", recipient="recipient", message_type=MessageType.INFO, content="test")

    # This should not raise an exception
    await bus.send(msg)

    # The safe handler should have run despite the crash
    # Note: This assumes the crashing handler ran first or we don't care about order.
    # Since we appended crashing_handler first, it runs first in the list.
    assert len(received) == 1
