import { describe, it, expect } from 'vitest';
import { PolicyAgent } from '../../../../../electron/ops/agents/policy';
import type { ProposedAction } from '../../../../../src/types/ops';

describe('PolicyAgent', () => {
  const agent = new PolicyAgent();

  it('auto-declines low confidence proposals', () => {
    const proposal: ProposedAction = {
      id: 'prop-1',
      created_at: new Date().toISOString(),
      episode_id: 'ep-1',
      action_type: 'email_draft',
      title: 'Test',
      summary: 'Test',
      draft_content: '',
      confidence: 20,
      risk_level: 'low',
      status: 'pending',
      metadata: {},
    };

    const decision = agent.evaluate(proposal);

    expect(decision.action).toBe('auto_decline');
    expect(decision.reason).toContain('confidence');
  });

  it('requires approval for medium confidence', () => {
    const proposal: ProposedAction = {
      id: 'prop-1',
      created_at: new Date().toISOString(),
      episode_id: 'ep-1',
      action_type: 'email_draft',
      title: 'Test',
      summary: 'Test',
      draft_content: 'Hello...',
      confidence: 55,
      risk_level: 'low',
      status: 'pending',
      metadata: {},
    };

    const decision = agent.evaluate(proposal);

    expect(decision.action).toBe('require_approval');
  });

  it('allows one-click for high confidence + low risk', () => {
    const proposal: ProposedAction = {
      id: 'prop-1',
      created_at: new Date().toISOString(),
      episode_id: 'ep-1',
      action_type: 'email_draft',
      title: 'Test',
      summary: 'Test',
      draft_content: 'Hello...',
      confidence: 75,
      risk_level: 'low',
      status: 'pending',
      metadata: {},
    };

    const decision = agent.evaluate(proposal);

    expect(decision.action).toBe('one_click_approve');
  });
});
