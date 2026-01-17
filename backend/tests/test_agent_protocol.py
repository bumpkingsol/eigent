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
