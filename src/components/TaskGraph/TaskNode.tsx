import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { CheckCircle, Circle, Loader2, XCircle } from "lucide-react";

export type TaskStatus = "pending" | "running" | "completed" | "failed";

export interface TaskNodeData {
  label: string;
  status: TaskStatus;
  agent?: string;
  onClick?: () => void;
}

const statusIcons = {
  pending: Circle,
  running: Loader2,
  completed: CheckCircle,
  failed: XCircle,
};

const statusColors = {
  pending: "border-muted-foreground/30 bg-muted/50",
  running: "border-blue-500 bg-blue-500/10",
  completed: "border-green-500 bg-green-500/10",
  failed: "border-red-500 bg-red-500/10",
};

export const TaskNode = memo(({ data }: NodeProps) => {
  const nodeData = data as TaskNodeData;
  const Icon = statusIcons[nodeData.status];

  return (
    <div
      onClick={nodeData.onClick}
      className={cn(
        "px-4 py-3 rounded-lg border-2 min-w-[200px] cursor-pointer transition-all hover:shadow-md",
        statusColors[nodeData.status]
      )}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3" />

      <div className="flex items-start gap-2">
        <Icon
          className={cn(
            "w-5 h-5 mt-0.5 shrink-0",
            nodeData.status === "running" && "animate-spin",
            nodeData.status === "completed" && "text-green-500",
            nodeData.status === "failed" && "text-red-500"
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{nodeData.label}</p>
          {nodeData.agent && (
            <p className="text-xs text-muted-foreground mt-1">{nodeData.agent}</p>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  );
});

TaskNode.displayName = "TaskNode";
