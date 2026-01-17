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

import pytest
import tempfile
from pathlib import Path
from app.component.checkpoint import CheckpointManager
from app.component.orchestrator import TaskGraph, TaskNode, TaskStatus


def test_checkpoint_saves_and_restores():
    with tempfile.TemporaryDirectory() as tmpdir:
        manager = CheckpointManager(Path(tmpdir))

        # Create a task graph
        graph = TaskGraph()
        graph.add_node(
            TaskNode(id="1", content="Task 1", agent="dev", status=TaskStatus.COMPLETED)
        )
        graph.add_node(
            TaskNode(
                id="2",
                content="Task 2",
                agent="dev",
                depends_on=["1"],
                status=TaskStatus.RUNNING,
            )
        )
        graph.add_node(
            TaskNode(id="3", content="Task 3", agent="browser", depends_on=["1"])
        )

        # Save checkpoint
        checkpoint_id = manager.save(
            task_id="test-task-123",
            graph=graph,
            context={"user_input": "original question"},
        )

        # Restore checkpoint
        restored = manager.load(checkpoint_id)

        assert restored["graph"].nodes["1"].status == TaskStatus.COMPLETED
        assert restored["graph"].nodes["2"].status == TaskStatus.RUNNING
        assert restored["context"]["user_input"] == "original question"


def test_checkpoint_lists_by_task():
    with tempfile.TemporaryDirectory() as tmpdir:
        manager = CheckpointManager(Path(tmpdir))
        graph = TaskGraph()
        graph.add_node(TaskNode(id="1", content="Task 1", agent="dev"))

        manager.save("task-a", graph, {})
        manager.save("task-a", graph, {})
        manager.save("task-b", graph, {})

        task_a_checkpoints = manager.list_checkpoints("task-a")
        assert len(task_a_checkpoints) == 2
