import { motion, AnimatePresence } from "framer-motion";
import { Brain, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface ReasoningPanelProps {
  thoughts: string[];
  agentName?: string;
  defaultExpanded?: boolean;
}

export function ReasoningPanel({ thoughts, agentName, defaultExpanded = false }: ReasoningPanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (thoughts.length === 0) return null;

  return (
    <div className="border border-border/50 rounded-lg bg-muted/30 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="w-full px-3 py-2 flex items-center justify-between text-sm text-muted-foreground hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4" />
          <span>{agentName ? `${agentName}'s reasoning` : "Agent reasoning"}</span>
          <span className="text-xs">({thoughts.length} steps)</span>
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-3 pb-3"
          >
            <ol className="list-decimal list-inside space-y-1 text-sm">
              {thoughts.map((thought, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="text-foreground/80"
                >
                  {thought.replace(/^Step \d+: /, "")}
                </motion.li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
