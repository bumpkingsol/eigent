import { describe, it, expect, vi } from 'vitest';
import { RunnerAgent } from '../../../../../electron/ops/agents/runner';
import type { ProposedAction } from '../../../../../src/types/ops';

describe('RunnerAgent', () => {
  it('routes email_draft to gmail integration', async () => {
    const mockIntegrations = {
      execute: vi.fn().mockResolvedValue({ draft_id: 'draft-123' }),
    };

    const runner = new RunnerAgent(mockIntegrations as any);

    const proposal: ProposedAction = {
      id: 'prop-1',
      created_at: new Date().toISOString(),
      episode_id: 'ep-1',
      action_type: 'email_draft',
      title: 'Reply to email',
      summary: 'Draft reply',
      draft_content: 'Hello...',
      confidence: 80,
      risk_level: 'low',
      status: 'approved',
      metadata: { to: 'test@example.com', subject: 'Re: Test' },
    };

    const result = await runner.execute(proposal);

    expect(result.success).toBe(true);
    expect(result.proposal_id).toBe('prop-1');
    expect(mockIntegrations.execute).toHaveBeenCalledWith(
      'email_draft',
      'Hello...',
      expect.objectContaining({ to: 'test@example.com' })
    );
  });

  it('returns failure result on error', async () => {
    const mockIntegrations = {
      execute: vi.fn().mockRejectedValue(new Error('API error')),
    };

    const runner = new RunnerAgent(mockIntegrations as any);

    const proposal: ProposedAction = {
      id: 'prop-1',
      created_at: new Date().toISOString(),
      episode_id: 'ep-1',
      action_type: 'email_draft',
      title: 'Test',
      summary: 'Test',
      draft_content: '',
      confidence: 80,
      risk_level: 'low',
      status: 'approved',
      metadata: {},
    };

    const result = await runner.execute(proposal);

    expect(result.success).toBe(false);
    expect(result.error_message).toBe('API error');
  });
});
