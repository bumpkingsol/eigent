import pytest
from unittest.mock import Mock, AsyncMock
from app.component.orchestrator import Orchestrator, TaskGraph, TaskNode, TaskStatus


@pytest.mark.asyncio
async def test_orchestrator_creates_task_graph():
    orchestrator = Orchestrator()

    graph = await orchestrator.decompose("Build a website with a contact form that sends emails")

    assert isinstance(graph, TaskGraph)
    assert len(graph.nodes) > 0
    assert graph.root is not None


@pytest.mark.asyncio
async def test_orchestrator_identifies_dependencies():
    orchestrator = Orchestrator()

    graph = TaskGraph()
    graph.add_node(TaskNode(id="1", content="Create HTML structure", agent="developer"))
    graph.add_node(TaskNode(id="2", content="Add CSS styling", agent="developer", depends_on=["1"]))
    graph.add_node(TaskNode(id="3", content="Implement form submission", agent="developer", depends_on=["1"]))

    ready = graph.get_ready_tasks()
    assert len(ready) == 1
    assert ready[0].id == "1"

    graph.mark_complete("1")
    ready = graph.get_ready_tasks()
    assert len(ready) == 2  # Tasks 2 and 3 can now run in parallel
