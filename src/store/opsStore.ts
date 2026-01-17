import { create } from 'zustand';
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
  initialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  cleanup: () => void;
  refreshProposals: () => Promise<void>;
  approveProposal: (id: string, editedContent?: string) => Promise<void>;
  declineProposal: (id: string) => Promise<void>;
  startObservation: () => Promise<void>;
  stopObservation: () => Promise<void>;
  togglePrivateMode: () => Promise<void>;
  setNotifications: (settings: Partial<NotificationSettings>) => void;

  // Internal
  _addProposal: (proposal: ProposedAction) => void;
  _setPendingCount: (count: number) => void;
  _cleanupFunctions: (() => void)[];
}

const useOpsStore = create<OpsStore>()((set, get) => ({
  // Initial state
  proposals: [],
  playbooks: [],
  pendingCount: 0,
  isObserving: false,
  isPrivateMode: false,
  notifications: { enabled: true, sound: false },
  initialized: false,
  _cleanupFunctions: [],

  initialize: async () => {
    if (get().initialized || !window.opsAPI) return;

    try {
      // Load initial data
      const proposals = await window.opsAPI.getProposals();
      const playbooks = await window.opsAPI.getPlaybooks();
      const pendingCount = proposals.filter((p) => p.status === 'pending').length;

      // Subscribe to events and store cleanup functions
      const cleanupNewProposal = window.opsAPI.onNewProposal((proposal) => {
        get()._addProposal(proposal);
      });

      const cleanupPendingCount = window.opsAPI.onPendingCountChanged((count) => {
        get()._setPendingCount(count);
      });

      set({
        proposals,
        playbooks,
        pendingCount,
        initialized: true,
        _cleanupFunctions: [cleanupNewProposal, cleanupPendingCount],
      });
    } catch (error) {
      console.error('[opsStore] Failed to initialize:', error);
    }
  },

  cleanup: () => {
    get()._cleanupFunctions.forEach((fn) => fn?.());
    set({ initialized: false, _cleanupFunctions: [] });
  },

  refreshProposals: async () => {
    if (!window.opsAPI) return;
    try {
      const proposals = await window.opsAPI.getProposals();
      set({
        proposals,
        pendingCount: proposals.filter((p) => p.status === 'pending').length,
      });
    } catch (error) {
      console.error('[opsStore] Failed to refresh proposals:', error);
    }
  },

  approveProposal: async (id, editedContent) => {
    if (!window.opsAPI) return;
    try {
      await window.opsAPI.approveProposal(id, editedContent);
      set((state) => ({
        proposals: state.proposals.map((p) =>
          p.id === id ? { ...p, status: 'approved' as const } : p
        ),
      }));
    } catch (error) {
      console.error('[opsStore] Failed to approve proposal:', error);
    }
  },

  declineProposal: async (id) => {
    if (!window.opsAPI) return;
    try {
      await window.opsAPI.declineProposal(id);
      set((state) => ({
        proposals: state.proposals.map((p) =>
          p.id === id ? { ...p, status: 'declined' as const } : p
        ),
      }));
    } catch (error) {
      console.error('[opsStore] Failed to decline proposal:', error);
    }
  },

  startObservation: async () => {
    if (!window.opsAPI) return;
    try {
      await window.opsAPI.startObservation();
      set({ isObserving: true });
    } catch (error) {
      console.error('[opsStore] Failed to start observation:', error);
    }
  },

  stopObservation: async () => {
    if (!window.opsAPI) return;
    try {
      await window.opsAPI.stopObservation();
      set({ isObserving: false });
    } catch (error) {
      console.error('[opsStore] Failed to stop observation:', error);
    }
  },

  togglePrivateMode: async () => {
    if (!window.opsAPI) return;
    const newMode = !get().isPrivateMode;
    try {
      await window.opsAPI.setPrivateMode(newMode);
      set({ isPrivateMode: newMode });
    } catch (error) {
      console.error('[opsStore] Failed to toggle private mode:', error);
    }
  },

  setNotifications: (settings) =>
    set((state) => ({
      notifications: { ...state.notifications, ...settings },
    })),

  _addProposal: (proposal) =>
    set((state) => ({
      proposals: [proposal, ...state.proposals],
      // Don't increment pendingCount here - rely on _setPendingCount from IPC
    })),

  _setPendingCount: (count) => set({ pendingCount: count }),
}));

export { useOpsStore };
export const getOpsStore = () => useOpsStore.getState();
