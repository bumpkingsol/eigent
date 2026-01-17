import { Pause, Play, SkipForward, StopCircle, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type TaskControlStatus = "running" | "paused" | "pending" | "finished";

interface TaskControlsProps {
  status: TaskControlStatus;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSkip: () => void;
  onEdit: () => void;
  disabled?: boolean;
}

export function TaskControls({
  status,
  onPause,
  onResume,
  onStop,
  onSkip,
  onEdit,
  disabled = false,
}: TaskControlsProps) {
  const isRunning = status === "running";
  const isPaused = status === "paused";

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {isRunning && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onPause}
                disabled={disabled}
                className="h-8 w-8"
              >
                <Pause className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pause execution</TooltipContent>
          </Tooltip>
        )}

        {isPaused && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onResume}
                disabled={disabled}
                className="h-8 w-8"
              >
                <Play className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Resume execution</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onSkip}
              disabled={disabled || status === "finished"}
              className="h-8 w-8"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Skip current task</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              disabled={disabled || isRunning}
              className="h-8 w-8"
            >
              <Edit className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit task plan</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onStop}
              disabled={disabled || status === "finished"}
              className="h-8 w-8 text-destructive hover:text-destructive"
            >
              <StopCircle className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stop execution</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
