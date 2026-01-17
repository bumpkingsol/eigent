from dataclasses import dataclass, field
from typing import List, Optional, Set, Dict
from enum import Enum


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class TaskNode:
    id: str
    content: str
    agent: str
    depends_on: List[str] = field(default_factory=list)
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[str] = None


class TaskGraph:
    def __init__(self):
        self.nodes: Dict[str, TaskNode] = {}
        self.root: Optional[str] = None

    def add_node(self, node: TaskNode):
        self.nodes[node.id] = node
        if not node.depends_on and self.root is None:
            self.root = node.id

    def get_ready_tasks(self) -> List[TaskNode]:
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
        if node_id in self.nodes:
            self.nodes[node_id].status = TaskStatus.COMPLETED
            self.nodes[node_id].result = result

    def mark_running(self, node_id: str):
        if node_id in self.nodes:
            self.nodes[node_id].status = TaskStatus.RUNNING

    def mark_failed(self, node_id: str):
        if node_id in self.nodes:
            self.nodes[node_id].status = TaskStatus.FAILED


class Orchestrator:
    async def decompose(self, task: str) -> TaskGraph:
        # Placeholder - will integrate with CAMEL task decomposition
        graph = TaskGraph()
        graph.add_node(TaskNode(id="1", content=task, agent="developer"))
        return graph
