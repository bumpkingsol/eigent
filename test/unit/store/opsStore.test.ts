import { describe, it, expect, beforeEach } from 'vitest';
import { useOpsStore, getOpsStore } from '../../../src/store/opsStore';
import type { ProposedAction } from '../../../src/types/ops';

describe('opsStore', () => {
  beforeEach(() => {
    // Reset store state
    useOpsStore.setState({
      proposals: [],
      pendingCount: 0,
      isObserving: false,
      isPrivateMode: false,
      notifications: { enabled: true, sound: false },
    });
  });

  it('adds a proposal and updates pending count', () => {
    const proposal: ProposedAction = {
      id: 'prop-1',
      created_at: new Date().toISOString(),
      episode_id: 'ep-1',
      action_type: 'email_draft',
      title: 'Reply to John',
      summary: 'Draft reply to John about meeting',
      draft_content: 'Hello John...',
      confidence: 75,
      risk_level: 'low',
      status: 'pending',
      metadata: {},
    };

    getOpsStore().addProposal(proposal);

    const state = getOpsStore();
    expect(state.proposals.length).toBe(1);
    expect(state.pendingCount).toBe(1);
  });

  it('approves a proposal and decrements pending count', () => {
    const proposal: ProposedAction = {
      id: 'prop-1',
      created_at: new Date().toISOString(),
      episode_id: 'ep-1',
      action_type: 'email_draft',
      title: 'Reply to John',
      summary: 'Draft reply',
      draft_content: 'Hello...',
      confidence: 75,
      risk_level: 'low',
      status: 'pending',
      metadata: {},
    };

    getOpsStore().addProposal(proposal);
    getOpsStore().approveProposal('prop-1');

    const state = getOpsStore();
    expect(state.proposals[0].status).toBe('approved');
    expect(state.pendingCount).toBe(0);
  });

  it('toggles private mode', () => {
    expect(getOpsStore().isPrivateMode).toBe(false);
    getOpsStore().togglePrivateMode();
    expect(getOpsStore().isPrivateMode).toBe(true);
    getOpsStore().togglePrivateMode();
    expect(getOpsStore().isPrivateMode).toBe(false);
  });

  it('toggles observation state', () => {
    getOpsStore().setObserving(true);
    expect(getOpsStore().isObserving).toBe(true);
    getOpsStore().setObserving(false);
    expect(getOpsStore().isObserving).toBe(false);
  });

  it('does not decrement pendingCount when approving an already approved proposal', () => {
    const store = getOpsStore();
    const proposal: ProposedAction = {
      id: 'prop-1',
      created_at: new Date().toISOString(),
      episode_id: 'ep-1',
      action_type: 'email_draft',
      title: 'Test',
      summary: 'Test',
      draft_content: 'Test',
      confidence: 75,
      risk_level: 'low',
      status: 'pending',
      metadata: {},
    };

    store.addProposal(proposal);
    store.approveProposal('prop-1');
    store.approveProposal('prop-1'); // Double approve

    expect(getOpsStore().pendingCount).toBe(0); // Should still be 0, not -1
  });

  it('declines a proposal and decrements pending count', () => {
    const store = getOpsStore();
    const proposal: ProposedAction = {
      id: 'prop-1',
      created_at: new Date().toISOString(),
      episode_id: 'ep-1',
      action_type: 'email_draft',
      title: 'Test',
      summary: 'Test',
      draft_content: 'Test',
      confidence: 75,
      risk_level: 'low',
      status: 'pending',
      metadata: {},
    };

    store.addProposal(proposal);
    store.declineProposal('prop-1');

    expect(getOpsStore().proposals[0].status).toBe('declined');
    expect(getOpsStore().pendingCount).toBe(0);
  });
});
