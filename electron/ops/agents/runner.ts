import type { ProposedAction } from '../../../src/types/ops';
import type { IntegrationManager } from '../integrations/manager';

export interface ExecutionResult {
  success: boolean;
  action_type: string;
  proposal_id: string;
  result_data?: Record<string, unknown>;
  error_message?: string;
  executed_at: string;
}

export class RunnerAgent {
  constructor(private integrations: IntegrationManager) {}

  async execute(proposal: ProposedAction): Promise<ExecutionResult> {
    const startTime = new Date().toISOString();

    try {
      const result = await this.integrations.execute(
        proposal.action_type,
        proposal.draft_content,
        proposal.metadata
      );

      return {
        success: true,
        action_type: proposal.action_type,
        proposal_id: proposal.id,
        result_data: result,
        executed_at: startTime,
      };
    } catch (error) {
      return {
        success: false,
        action_type: proposal.action_type,
        proposal_id: proposal.id,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        executed_at: startTime,
      };
    }
  }
}
