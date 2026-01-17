# ========= Copyright 2025 @ EIGENT.AI. All Rights Reserved. =========
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ========= Copyright 2025 @ EIGENT.AI. All Rights Reserved. =========

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from app.component.orchestrator import TaskGraph, TaskNode, TaskStatus


class CheckpointManager:
    """Manages task state checkpoints for crash recovery.

    Saves and restores TaskGraph state to disk, enabling tasks to resume
    from where they left off after failures or restarts.

    Attributes:
        storage_path: Directory where checkpoint files are stored.
    """

    def __init__(self, storage_path: Path):
        """Initialize checkpoint manager.

        Args:
            storage_path: Directory to store checkpoint files.
        """
        self.storage_path = storage_path
        self.storage_path.mkdir(parents=True, exist_ok=True)

    def save(self, task_id: str, graph: TaskGraph, context: Dict[str, Any]) -> str:
        """Save a checkpoint of the current task state.

        Args:
            task_id: Identifier for the parent task.
            graph: Current TaskGraph state.
            context: Additional context data to preserve.

        Returns:
            Unique checkpoint ID.
        """
        checkpoint_id = (
            f"{task_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
        )

        checkpoint_data = {
            "checkpoint_id": checkpoint_id,
            "task_id": task_id,
            "timestamp": datetime.now().isoformat(),
            "graph": self._serialize_graph(graph),
            "context": context,
        }

        checkpoint_file = self.storage_path / f"{checkpoint_id}.json"
        with open(checkpoint_file, "w") as f:
            json.dump(checkpoint_data, f, indent=2)

        return checkpoint_id

    def load(self, checkpoint_id: str) -> Dict[str, Any]:
        """Load a checkpoint by ID.

        Args:
            checkpoint_id: ID of the checkpoint to load.

        Returns:
            Dictionary with checkpoint_id, task_id, timestamp, graph, and context.

        Raises:
            FileNotFoundError: If checkpoint doesn't exist.
        """
        checkpoint_file = self.storage_path / f"{checkpoint_id}.json"

        with open(checkpoint_file, "r") as f:
            data = json.load(f)

        return {
            "checkpoint_id": data["checkpoint_id"],
            "task_id": data["task_id"],
            "timestamp": data["timestamp"],
            "graph": self._deserialize_graph(data["graph"]),
            "context": data["context"],
        }

    def list_checkpoints(self, task_id: str) -> List[str]:
        """List all checkpoints for a task.

        Args:
            task_id: Task identifier to filter by.

        Returns:
            List of checkpoint IDs, sorted by creation time.
        """
        checkpoints = []
        for file in self.storage_path.glob(f"{task_id}_*.json"):
            checkpoints.append(file.stem)
        return sorted(checkpoints)

    def delete(self, checkpoint_id: str) -> bool:
        """Delete a checkpoint.

        Args:
            checkpoint_id: ID of the checkpoint to delete.

        Returns:
            True if deleted, False if not found.
        """
        checkpoint_file = self.storage_path / f"{checkpoint_id}.json"
        if checkpoint_file.exists():
            checkpoint_file.unlink()
            return True
        return False

    def _serialize_graph(self, graph: TaskGraph) -> Dict:
        """Serialize TaskGraph to JSON-compatible dict."""
        return {
            "nodes": {
                node_id: {
                    "id": node.id,
                    "content": node.content,
                    "agent": node.agent,
                    "depends_on": node.depends_on,
                    "status": node.status.value,
                    "result": node.result,
                }
                for node_id, node in graph.nodes.items()
            },
            "root": graph.root,
        }

    def _deserialize_graph(self, data: Dict) -> TaskGraph:
        """Deserialize dict back to TaskGraph."""
        graph = TaskGraph()
        graph.root = data["root"]

        for node_id, node_data in data["nodes"].items():
            graph.nodes[node_id] = TaskNode(
                id=node_data["id"],
                content=node_data["content"],
                agent=node_data["agent"],
                depends_on=node_data["depends_on"],
                status=TaskStatus(node_data["status"]),
                result=node_data["result"],
            )

        return graph
