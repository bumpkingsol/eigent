import { useState } from 'react';
import { Inbox, Pause, Play, EyeOff, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOpsStore } from '@/store/opsStore';
import { ProposalCard } from './ProposalCard';

export function OpsInbox() {
  const {
    proposals,
    pendingCount,
    isObserving,
    isPrivateMode,
    approveProposal,
    declineProposal,
    setObserving,
    togglePrivateMode,
  } = useOpsStore();

  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  const pendingProposals = proposals.filter((p) => p.status === 'pending');
  const historyProposals = proposals.filter((p) => p.status !== 'pending');

  const handleEdit = (id: string) => {
    // TODO: Open edit dialog
    console.log('Edit proposal:', id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          <h2 className="font-semibold">Ops Inbox</h2>
          {pendingCount > 0 && (
            <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
              {pendingCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isPrivateMode && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
              Private Mode
            </span>
          )}

          <Button
            size="icon"
            variant="ghost"
            onClick={togglePrivateMode}
            title={isPrivateMode ? 'Exit Private Mode' : 'Enter Private Mode'}
          >
            <EyeOff className={`h-4 w-4 ${isPrivateMode ? 'text-yellow-500' : ''}`} />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={() => setObserving(!isObserving)}
            title={isObserving ? 'Pause Observation' : 'Resume Observation'}
          >
            {isObserving ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          <Button size="icon" variant="ghost" title="Settings">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pending' | 'history')} className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-2">
          <TabsTrigger value="pending" className="flex-1">
            Pending ({pendingProposals.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1">
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="flex-1 mt-0">
          <div className="h-full overflow-auto p-4">
            {pendingProposals.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <Inbox className="h-12 w-12 mb-2 opacity-50" />
                <p>No pending proposals</p>
                <p className="text-sm">New proposals will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingProposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    onApprove={approveProposal}
                    onDecline={declineProposal}
                    onEdit={handleEdit}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history" className="flex-1 mt-0">
          <div className="h-full overflow-auto p-4">
            {historyProposals.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <p>No history yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {historyProposals.slice(0, 50).map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    onApprove={approveProposal}
                    onDecline={declineProposal}
                    onEdit={handleEdit}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export { ProposalCard } from './ProposalCard';
