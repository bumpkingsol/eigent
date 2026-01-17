import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TaskNode, TaskStatus, TaskNodeData } from "./TaskNode";

export interface TaskData {
  id: string;
  content: string;
  status: TaskStatus;
  agent?: string;
  depends_on?: string[];
}

interface TaskGraphProps {
  tasks: TaskData[];
  onTaskClick?: (taskId: string) => void;
}

const nodeTypes = {
  task: TaskNode,
};

export function TaskGraph({ tasks, onTaskClick }: TaskGraphProps) {
  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map<string, Node<TaskNodeData>>();
    const edgeList: Edge[] = [];

    // Create nodes with layout
    tasks.forEach((task, index) => {
      const row = Math.floor(index / 3);
      const col = index % 3;

      nodeMap.set(task.id, {
        id: task.id,
        type: "task",
        position: { x: col * 250, y: row * 150 },
        data: {
          label: task.content,
          status: task.status,
          agent: task.agent,
          onClick: () => onTaskClick?.(task.id),
        },
      });
    });

    // Create edges from dependencies
    tasks.forEach((task) => {
      task.depends_on?.forEach((depId) => {
        const sourceNode = nodeMap.get(depId);
        edgeList.push({
          id: `${depId}-${task.id}`,
          source: depId,
          target: task.id,
          markerEnd: { type: MarkerType.ArrowClosed },
          animated: sourceNode?.data.status === "running",
        });
      });
    });

    return { nodes: Array.from(nodeMap.values()), edges: edgeList };
  }, [tasks, onTaskClick]);

  const [flowNodes, , onNodesChange] = useNodesState(nodes);
  const [flowEdges, , onEdgesChange] = useEdgesState(edges);

  if (tasks.length === 0) {
    return (
      <div className="h-[400px] w-full border rounded-lg flex items-center justify-center text-muted-foreground">
        No tasks to display
      </div>
    );
  }

  return (
    <div className="h-[400px] w-full border rounded-lg overflow-hidden">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

export { TaskNode } from "./TaskNode";
export type { TaskStatus, TaskNodeData } from "./TaskNode";
