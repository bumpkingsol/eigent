import type { ProposedAction, Playbook } from './ops';

export interface ExecutionResult {
  success: boolean;
  action_type: string;
  proposal_id: string;
  result_data?: Record<string, unknown>;
  error_message?: string;
  executed_at: string;
}

export interface OpsAPI {
  getProposals(): Promise<ProposedAction[]>;
  getPlaybooks(): Promise<Playbook[]>;
  approveProposal(id: string, editedContent?: string): Promise<boolean>;
  declineProposal(id: string): Promise<boolean>;
  startObservation(): Promise<boolean>;
  stopObservation(): Promise<boolean>;
  setPrivateMode(enabled: boolean): Promise<boolean>;
  onNewProposal(callback: (proposal: ProposedAction) => void): () => void;
  onPendingCountChanged(callback: (count: number) => void): () => void;
  onExecutionComplete(callback: (result: ExecutionResult) => void): () => void;
  onShowOpsInbox(callback: () => void): () => void;
}

declare global {
  interface Window {
    opsAPI?: OpsAPI;
  }
}

export {};
