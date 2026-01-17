import { useState } from 'react';
import { Bug, Clock, HelpCircle, Play, GitCompare } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface TimelineEntry {
  timestamp: string;
  type: 'observation' | 'episode' | 'proposal' | 'decision' | 'execution';
  summary: string;
  details: Record<string, unknown>;
}

interface DebugPanelProps {
  timeline: TimelineEntry[];
  onReplay?: (entries: TimelineEntry[]) => void;
}

const typeColors: Record<TimelineEntry['type'], string> = {
  observation: 'bg-blue-100 text-blue-800',
  episode: 'bg-purple-100 text-purple-800',
  proposal: 'bg-green-100 text-green-800',
  decision: 'bg-yellow-100 text-yellow-800',
  execution: 'bg-red-100 text-red-800',
};

export function DebugPanel({ timeline, onReplay }: DebugPanelProps) {
  const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b">
        <Bug className="h-5 w-5" />
        <h3 className="font-semibold">Debug Tools</h3>
      </div>

      <Tabs defaultValue="timeline" className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-2">
          <TabsTrigger value="timeline" className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="explain" className="flex items-center gap-1">
            <HelpCircle className="h-4 w-4" />
            Explain
          </TabsTrigger>
          <TabsTrigger value="replay" className="flex items-center gap-1">
            <Play className="h-4 w-4" />
            Replay
          </TabsTrigger>
          <TabsTrigger value="diff" className="flex items-center gap-1">
            <GitCompare className="h-4 w-4" />
            Diff
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="flex-1 mt-0">
          <div className="h-full p-4 overflow-auto">
            <div className="space-y-2">
              {timeline.map((entry, index) => (
                <Card
                  key={index}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedEntry(entry)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={typeColors[entry.type]} variant="secondary">
                            {entry.type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm">{entry.summary}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="explain" className="flex-1 mt-0 p-4">
          <div className="text-center text-muted-foreground py-8">
            Select a playbook and observation to explain why it did or didn't trigger.
          </div>
        </TabsContent>

        <TabsContent value="replay" className="flex-1 mt-0 p-4">
          <div className="text-center text-muted-foreground py-8">
            Select a time range to replay observations and test playbook changes.
          </div>
        </TabsContent>

        <TabsContent value="diff" className="flex-1 mt-0 p-4">
          <div className="text-center text-muted-foreground py-8">
            Compare playbook behavior across different time periods.
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail panel */}
      {selectedEntry && (
        <div className="border-t p-4">
          <h4 className="font-medium mb-2">Details</h4>
          <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
            {JSON.stringify(selectedEntry.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
