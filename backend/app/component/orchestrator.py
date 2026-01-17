from dataclasses import dataclass, field
from typing import List, Optional, Set, Dict
from enum import Enum


class TaskStatus(str, Enum):
    """Enum representing the current status of a task."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class TaskNode:
    """Represents a single unit of work in the task graph.

    Attributes:
        id: Unique identifier for the task.
        content: Description of the task to be performed.
        agent: The type of agent best suited for this task.
        depends_on: List of task IDs that this task depends on.
        status: Current execution status of the task.
        result: The output of the task execution, if completed.
    """

    id: str
    content: str
    agent: str
    depends_on: List[str] = field(default_factory=list)
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[str] = None


class TaskGraph:
    """Manages the dependency graph of tasks.

    This class handles the storage of task nodes, tracking of dependencies,
    and determination of task execution order.
    """

    def __init__(self):
        """Initialize an empty task graph."""
        self.nodes: Dict[str, TaskNode] = {}
        self.root: Optional[str] = None

    def add_node(self, node: TaskNode):
        """Adds a task node to the graph.

        If the node has no dependencies and no root is set, this node
        becomes the root.

        Args:
            node: The task node to add.
        """
        self.nodes[node.id] = node
        if not node.depends_on and self.root is None:
            self.root = node.id

    def get_ready_tasks(self) -> List[TaskNode]:
        """Returns a list of tasks that are ready to be executed.

        A task is ready if its status is PENDING and all of its
        dependencies have a COMPLETED status.

        Returns:
            List[TaskNode]: A list of task nodes ready for execution.
        """
        ready = []
        for node in self.nodes.values():
            if node.status != TaskStatus.PENDING:
                continue

            deps_satisfied = all(
                self.nodes[dep_id].status == TaskStatus.COMPLETED for dep_id in node.depends_on if dep_id in self.nodes
            )

            if deps_satisfied:
                ready.append(node)

        return ready

    def mark_complete(self, node_id: str, result: Optional[str] = None):
        """Marks a specific task as completed.

        Args:
            node_id: The ID of the task to mark complete.
            result: The output/result of the task execution.
        """
        if node_id in self.nodes:
            self.nodes[node_id].status = TaskStatus.COMPLETED
            self.nodes[node_id].result = result

    def mark_running(self, node_id: str):
        """Marks a specific task as currently running.

        Args:
            node_id: The ID of the task to mark as running.
        """
        if node_id in self.nodes:
            self.nodes[node_id].status = TaskStatus.RUNNING

    def mark_failed(self, node_id: str):
        """Marks a specific task as failed.

        Args:
            node_id: The ID of the task to mark as failed.
        """
        if node_id in self.nodes:
            self.nodes[node_id].status = TaskStatus.FAILED


class Orchestrator:
    """Handles high-level task decomposition and coordination.

    The Orchestrator is responsible for breaking down complex user requests
    into a graph of smaller, manageable tasks.
    """

    async def decompose(self, task: str) -> TaskGraph:
        """Decomposes a high-level task into a graph of subtasks.

        Args:
            task: The high-level task description provided by the user.

        Returns:
            TaskGraph: A directed acyclic graph of tasks representing the plan.
        """
        # Placeholder - will integrate with CAMEL task decomposition
        graph = TaskGraph()
        graph.add_node(TaskNode(id="1", content=task, agent="developer"))
        return graph
