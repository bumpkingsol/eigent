import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProposedAction, Playbook } from '../types/ops';

interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
}

interface OpsStore {
  // State
  proposals: ProposedAction[];
  playbooks: Playbook[];
  pendingCount: number;
  isObserving: boolean;
  isPrivateMode: boolean;
  notifications: NotificationSettings;

  // Actions - Proposals
  addProposal: (proposal: ProposedAction) => void;
  approveProposal: (id: string) => void;
  declineProposal: (id: string) => void;
  updateProposalDraft: (id: string, draft: string) => void;
  clearProposals: () => void;

  // Actions - Playbooks
  addPlaybook: (playbook: Playbook) => void;
  updatePlaybook: (id: string, updates: Partial<Playbook>) => void;
  deletePlaybook: (id: string) => void;

  // Actions - Observation
  setObserving: (observing: boolean) => void;
  togglePrivateMode: () => void;

  // Actions - Notifications
  setNotifications: (settings: Partial<NotificationSettings>) => void;
}

const useOpsStore = create<OpsStore>()(
  persist(
    (set) => ({
      // Initial state
      proposals: [],
      playbooks: [],
      pendingCount: 0,
      isObserving: false,
      isPrivateMode: false,
      notifications: { enabled: true, sound: false },

      // Proposal actions
      addProposal: (proposal) => set((state) => ({
        proposals: [proposal, ...state.proposals],
        pendingCount: state.pendingCount + 1,
      })),

      approveProposal: (id) => set((state) => {
        const proposal = state.proposals.find(p => p.id === id);
        const wasPending = proposal?.status === 'pending';
        return {
          proposals: state.proposals.map((p) =>
            p.id === id ? { ...p, status: 'approved' as const } : p
          ),
          pendingCount: wasPending ? Math.max(0, state.pendingCount - 1) : state.pendingCount,
        };
      }),

      declineProposal: (id) => set((state) => {
        const proposal = state.proposals.find(p => p.id === id);
        const wasPending = proposal?.status === 'pending';
        return {
          proposals: state.proposals.map((p) =>
            p.id === id ? { ...p, status: 'declined' as const } : p
          ),
          pendingCount: wasPending ? Math.max(0, state.pendingCount - 1) : state.pendingCount,
        };
      }),

      updateProposalDraft: (id, draft) => set((state) => ({
        proposals: state.proposals.map((p) =>
          p.id === id ? { ...p, draft_content: draft } : p
        ),
      })),

      clearProposals: () => set({ proposals: [], pendingCount: 0 }),

      // Playbook actions
      addPlaybook: (playbook) => set((state) => ({
        playbooks: [...state.playbooks, playbook],
      })),

      updatePlaybook: (id, updates) => set((state) => ({
        playbooks: state.playbooks.map((p) =>
          p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p
        ),
      })),

      deletePlaybook: (id) => set((state) => ({
        playbooks: state.playbooks.filter((p) => p.id !== id),
      })),

      // Observation actions
      setObserving: (observing) => set({ isObserving: observing }),

      togglePrivateMode: () => set((state) => ({
        isPrivateMode: !state.isPrivateMode,
      })),

      // Notification actions
      setNotifications: (settings) => set((state) => ({
        notifications: { ...state.notifications, ...settings },
      })),
    }),
    {
      name: 'ops-storage',
      partialize: (state) => ({
        playbooks: state.playbooks,
        notifications: state.notifications,
      }),
    }
  )
);

// Export hook version for components
export { useOpsStore };

// Export non-hook version for non-components
export const getOpsStore = () => useOpsStore.getState();
