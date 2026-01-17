# Ops Layer Connectivity Fix - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all connectivity gaps in the Ops Layer to create a working end-to-end system (Observe → Propose → Approve → Execute).

**Architecture:** Fix MCP event pipeline, add IPC bridge between renderer and main, integrate OpsInbox sidebar into Layout, create Runner Agent and Integration Manager for execution.

**Tech Stack:** Electron IPC, Zustand, TypeScript, better-sqlite3, googleapis, @notionhq/client

---

## Task 1: Fix MCP Server Event Structure

**Files:**
- Modify: `electron/ops/mcp-server/index.ts`
- Modify: `electron/ops/mcp-server/observers/app-observer.ts`
- Modify: `electron/ops/mcp-server/observers/window-observer.ts`
- Test: `test/unit/electron/ops/mcp-server/event-structure.test.ts`

**Step 1: Write the failing test**

Create `test/unit/electron/ops/mcp-server/event-structure.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ComputerMcpServer } from '../../../../electron/ops/mcp-server/index';

describe('ComputerMcpServer event structure', () => {
  it('emits events with source at top level', () => {
    const server = new ComputerMcpServer();
    const events: any[] = [];

    server.onEvent((event) => events.push(event));

    // Trigger an event via the exposed test method
    server.testEmitEvent('app_activated', {
      app_bundle_id: 'com.google.Chrome',
      app_name: 'Google Chrome',
      window_title: 'Test',
      window_id: 1,
    }, {});

    expect(events).toHaveLength(1);
    expect(events[0].source).toBeDefined();
    expect(events[0].source.app_bundle_id).toBe('com.google.Chrome');
    expect(events[0].source.app_name).toBe('Google Chrome');
    expect(events[0].event_type).toBe('app_activated');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/electron/ops/mcp-server/event-structure.test.ts`
Expected: FAIL (testEmitEvent doesn't exist, event structure wrong)

**Step 3: Add shared context interface to MCP server**

In `electron/ops/mcp-server/index.ts`, add after imports:

```typescript
import type { ObservationEvent, ObservationEventType } from '../../../src/types/ops';

export interface CurrentContext {
  app_bundle_id: string;
  app_name: string;
  window_title: string;
  window_id: number;
  url?: string;
}
```

**Step 4: Update ComputerMcpServer class**

Replace the `emitEvent` method and add shared context:

```typescript
export class ComputerMcpServer {
  private server: Server;
  private appObserver: AppObserver;
  private windowObserver: WindowObserver;
  private sessionId: string;
  private isObserving: boolean = false;
  private isPrivateMode: boolean = false;
  private callbacks: ((event: ObservationEvent) => void)[] = [];
  private currentContext: CurrentContext = {
    app_bundle_id: '',
    app_name: '',
    window_title: '',
    window_id: 0,
  };

  constructor() {
    this.sessionId = uuidv7();
    this.server = new Server(
      { name: 'eigent-computer', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    this.appObserver = new AppObserver(this.updateAppContext.bind(this));
    this.windowObserver = new WindowObserver(this.updateWindowContext.bind(this));

    this.setupHandlers();
  }

  private updateAppContext(bundleId: string, appName: string): void {
    this.currentContext.app_bundle_id = bundleId;
    this.currentContext.app_name = appName;
    this.emitEvent('app_activated', {});
  }

  private updateWindowContext(title: string, windowId: number, url?: string): void {
    this.currentContext.window_title = title;
    this.currentContext.window_id = windowId;
    if (url) this.currentContext.url = url;
    this.emitEvent('window_focused', {});
  }

  private emitEvent(eventType: ObservationEventType, payload: ObservationEvent['payload']): void {
    if (!this.isObserving || this.isPrivateMode) return;

    const event: ObservationEvent = {
      id: uuidv7(),
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      source: { ...this.currentContext },
      event_type: eventType,
      payload,
      redaction_applied: [],
      confidence: 1.0,
    };

    for (const callback of this.callbacks) {
      callback(event);
    }
  }

  // For testing
  testEmitEvent(eventType: ObservationEventType, source: CurrentContext, payload: ObservationEvent['payload']): void {
    this.currentContext = source;
    this.isObserving = true;
    this.emitEvent(eventType, payload);
  }

  // ... rest of methods unchanged
}
```

**Step 5: Update AppObserver**

Replace `electron/ops/mcp-server/observers/app-observer.ts`:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

type AppContextCallback = (bundleId: string, appName: string) => void;

export class AppObserver {
  private intervalId: NodeJS.Timeout | null = null;
  private lastBundleId: string | null = null;
  private pollInterval: number = 1000;

  constructor(private onAppChange: AppContextCallback) {}

  start(): void {
    this.intervalId = setInterval(() => this.poll(), this.pollInterval);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      const app = await this.getFrontmostApp();
      if (app && app.bundleId !== this.lastBundleId) {
        this.lastBundleId = app.bundleId;
        this.onAppChange(app.bundleId, app.name);
      }
    } catch {
      // Silently ignore polling errors
    }
  }

  private async getFrontmostApp(): Promise<{ bundleId: string; name: string } | null> {
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        set bundleId to bundle identifier of frontApp
        return bundleId & "|" & appName
      end tell
    `;

    try {
      const { stdout } = await execAsync(`osascript -e '${script}'`);
      const [bundleId, name] = stdout.trim().split('|');
      return { bundleId, name };
    } catch {
      return null;
    }
  }

  getCurrentApp(): { bundleId: string; name: string } | null {
    return this.lastBundleId ? { bundleId: this.lastBundleId, name: '' } : null;
  }
}
```

**Step 6: Update WindowObserver**

Replace `electron/ops/mcp-server/observers/window-observer.ts`:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

type WindowContextCallback = (title: string, windowId: number, url?: string) => void;

export class WindowObserver {
  private intervalId: NodeJS.Timeout | null = null;
  private lastTitle: string | null = null;
  private pollInterval: number = 500;

  constructor(private onWindowChange: WindowContextCallback) {}

  start(): void {
    this.intervalId = setInterval(() => this.poll(), this.pollInterval);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      const window = await this.getFrontmostWindow();
      if (window && window.title !== this.lastTitle) {
        this.lastTitle = window.title;
        this.onWindowChange(window.title, 0, window.url);
      }
    } catch {
      // Silently ignore polling errors
    }
  }

  private async getFrontmostWindow(): Promise<{ title: string; url?: string } | null> {
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        try
          set windowTitle to name of front window of frontApp
        on error
          set windowTitle to ""
        end try
        return appName & "|" & windowTitle
      end tell
    `;

    try {
      const { stdout } = await execAsync(`osascript -e '${script}'`);
      const [, title] = stdout.trim().split('|');
      return { title: title || '' };
    } catch {
      return null;
    }
  }

  getCurrentWindow(): { title: string } | null {
    return this.lastTitle ? { title: this.lastTitle } : null;
  }
}
```

**Step 7: Run test to verify it passes**

Run: `npx vitest run test/unit/electron/ops/mcp-server/event-structure.test.ts`
Expected: PASS

**Step 8: Run all Ops tests to verify no regression**

Run: `npx vitest run test/unit/electron/ops`
Expected: All tests pass

---

## Task 2: Create IPC Bridge Preload Script

**Files:**
- Modify: `electron/preload/index.ts`
- Create: `src/types/ops-api.d.ts`
- Test: Manual verification via console

**Step 1: Add Ops API to preload script**

In `electron/preload/index.ts`, add after the `electronAPI` block (around line 108):

```typescript
// Ops Layer API
contextBridge.exposeInMainWorld('opsAPI', {
  // Queries
  getProposals: () => ipcRenderer.invoke('ops:get-proposals'),
  getPlaybooks: () => ipcRenderer.invoke('ops:get-playbooks'),

  // Commands
  approveProposal: (id: string, editedContent?: string) =>
    ipcRenderer.invoke('ops:approve-proposal', id, editedContent),
  declineProposal: (id: string) =>
    ipcRenderer.invoke('ops:decline-proposal', id),
  startObservation: () => ipcRenderer.invoke('ops:start-observation'),
  stopObservation: () => ipcRenderer.invoke('ops:stop-observation'),
  setPrivateMode: (enabled: boolean) =>
    ipcRenderer.invoke('ops:set-private-mode', enabled),

  // Event subscriptions
  onNewProposal: (callback: (proposal: any) => void) => {
    const handler = (_event: any, proposal: any) => callback(proposal);
    ipcRenderer.on('ops:new-proposal', handler);
    return () => ipcRenderer.removeListener('ops:new-proposal', handler);
  },
  onPendingCountChanged: (callback: (count: number) => void) => {
    const handler = (_event: any, count: number) => callback(count);
    ipcRenderer.on('ops:pending-count', handler);
    return () => ipcRenderer.removeListener('ops:pending-count', handler);
  },
  onExecutionComplete: (callback: (result: any) => void) => {
    const handler = (_event: any, result: any) => callback(result);
    ipcRenderer.on('ops:execution-complete', handler);
    return () => ipcRenderer.removeListener('ops:execution-complete', handler);
  },
  onShowOpsInbox: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('show-ops-inbox', handler);
    return () => ipcRenderer.removeListener('show-ops-inbox', handler);
  },
});
```

**Step 2: Create TypeScript declarations**

Create `src/types/ops-api.d.ts`:

```typescript
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
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -E "ops-api|opsAPI" | head -10`
Expected: No errors

---

## Task 3: Update OpsLayer to Send IPC Events

**Files:**
- Modify: `electron/ops/index.ts`

**Step 1: Import BrowserWindow for IPC sending**

At top of `electron/ops/index.ts`, add:

```typescript
import { ipcMain, app, BrowserWindow } from 'electron';
```

**Step 2: Add helper to send to all windows**

Add method to OpsLayer class:

```typescript
private sendToAllWindows(channel: string, ...args: any[]): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(channel, ...args);
  });
}
```

**Step 3: Update processEpisode to send IPC events**

In the `processEpisode` method, after storing proposal and before clearing buffer:

```typescript
// Send new proposal to all renderer windows
this.sendToAllWindows('ops:new-proposal', {
  ...proposal,
  metadata: proposal.metadata,
});

// Send updated pending count
this.sendToAllWindows('ops:pending-count', pendingCount);
```

**Step 4: Update IPC handlers to send count updates**

Modify the `approveProposal` and `declineProposal` handlers:

```typescript
ipcMain.handle('ops:approve-proposal', async (event, id: string, editedContent?: string) => {
  if (editedContent) {
    // Update draft content if edited
    this.db.updateProposalDraft?.(id, editedContent);
  }
  this.db.updateProposalStatus(id, 'approved');

  // Execute the proposal
  const proposal = this.db.getProposal(id);
  if (proposal) {
    // TODO: Call runner.execute() here in Task 6
  }

  const count = this.db.getPendingProposals().length;
  this.tray?.updatePendingCount(count);
  this.sendToAllWindows('ops:pending-count', count);
  return true;
});

ipcMain.handle('ops:decline-proposal', (_, id: string) => {
  this.db.updateProposalStatus(id, 'declined');
  const count = this.db.getPendingProposals().length;
  this.tray?.updatePendingCount(count);
  this.sendToAllWindows('ops:pending-count', count);
  return true;
});
```

**Step 5: Add set-private-mode handler**

```typescript
ipcMain.handle('ops:set-private-mode', (_, enabled: boolean) => {
  this.mcpServer.setPrivateMode(enabled);
  return true;
});
```

**Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "electron/ops" | head -10`
Expected: No errors

---

## Task 4: Update Zustand Store to Use IPC

**Files:**
- Modify: `src/store/opsStore.ts`

**Step 1: Rewrite store to use IPC**

Replace `src/store/opsStore.ts`:

```typescript
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

  initialize: async () => {
    if (get().initialized || !window.opsAPI) return;

    // Load initial data
    const proposals = await window.opsAPI.getProposals();
    const playbooks = await window.opsAPI.getPlaybooks();
    const pendingCount = proposals.filter((p) => p.status === 'pending').length;

    // Subscribe to events
    window.opsAPI.onNewProposal((proposal) => {
      get()._addProposal(proposal);
    });

    window.opsAPI.onPendingCountChanged((count) => {
      get()._setPendingCount(count);
    });

    set({
      proposals,
      playbooks,
      pendingCount,
      initialized: true,
    });
  },

  refreshProposals: async () => {
    if (!window.opsAPI) return;
    const proposals = await window.opsAPI.getProposals();
    set({
      proposals,
      pendingCount: proposals.filter((p) => p.status === 'pending').length,
    });
  },

  approveProposal: async (id, editedContent) => {
    if (!window.opsAPI) return;
    await window.opsAPI.approveProposal(id, editedContent);
    set((state) => ({
      proposals: state.proposals.map((p) =>
        p.id === id ? { ...p, status: 'approved' as const } : p
      ),
    }));
  },

  declineProposal: async (id) => {
    if (!window.opsAPI) return;
    await window.opsAPI.declineProposal(id);
    set((state) => ({
      proposals: state.proposals.map((p) =>
        p.id === id ? { ...p, status: 'declined' as const } : p
      ),
    }));
  },

  startObservation: async () => {
    if (!window.opsAPI) return;
    await window.opsAPI.startObservation();
    set({ isObserving: true });
  },

  stopObservation: async () => {
    if (!window.opsAPI) return;
    await window.opsAPI.stopObservation();
    set({ isObserving: false });
  },

  togglePrivateMode: async () => {
    if (!window.opsAPI) return;
    const newMode = !get().isPrivateMode;
    await window.opsAPI.setPrivateMode(newMode);
    set({ isPrivateMode: newMode });
  },

  setNotifications: (settings) =>
    set((state) => ({
      notifications: { ...state.notifications, ...settings },
    })),

  _addProposal: (proposal) =>
    set((state) => ({
      proposals: [proposal, ...state.proposals],
      pendingCount: state.pendingCount + 1,
    })),

  _setPendingCount: (count) => set({ pendingCount: count }),
}));

export { useOpsStore };
export const getOpsStore = () => useOpsStore.getState();
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "opsStore" | head -10`
Expected: No errors

---

## Task 5: Integrate OpsInbox Sidebar into Layout

**Files:**
- Modify: `src/components/Layout/index.tsx`
- Modify: `src/components/OpsInbox/index.tsx`
- Modify: `src/components/TopBar/index.tsx` (if exists, for toggle button)

**Step 1: Update OpsInbox to accept onClose prop and use IPC store**

At top of `src/components/OpsInbox/index.tsx`, update imports and add props:

```typescript
import { useEffect } from 'react';
import { Inbox, Pause, Play, EyeOff, Settings, X } from 'lucide-react';
// ... other imports

interface OpsInboxProps {
  onClose?: () => void;
}

export function OpsInbox({ onClose }: OpsInboxProps) {
  const {
    proposals,
    pendingCount,
    isObserving,
    isPrivateMode,
    initialized,
    initialize,
    approveProposal,
    declineProposal,
    startObservation,
    stopObservation,
    togglePrivateMode,
  } = useOpsStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // ... rest of component
```

Add close button in header (after Settings button):

```typescript
{onClose && (
  <Button size="icon" variant="ghost" onClick={onClose} title="Close">
    <X className="h-4 w-4" />
  </Button>
)}
```

Update button handlers to use async functions:

```typescript
<Button
  size="icon"
  variant="ghost"
  onClick={() => togglePrivateMode()}
  title={isPrivateMode ? 'Exit Private Mode' : 'Enter Private Mode'}
>

<Button
  size="icon"
  variant="ghost"
  onClick={() => isObserving ? stopObservation() : startObservation()}
  title={isObserving ? 'Pause Observation' : 'Resume Observation'}
>
```

**Step 2: Add OpsInbox sidebar to Layout**

In `src/components/Layout/index.tsx`, add imports:

```typescript
import { OpsInbox } from '@/components/OpsInbox';
import { useOpsStore } from '@/store/opsStore';
import { Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
```

Add state in Layout component (after other useState calls):

```typescript
const [opsInboxOpen, setOpsInboxOpen] = useState(false);
const { pendingCount, initialize: initOps } = useOpsStore();

useEffect(() => {
  initOps();

  // Listen for show-ops-inbox from tray
  const cleanup = window.opsAPI?.onShowOpsInbox(() => {
    setOpsInboxOpen(true);
  });

  return () => cleanup?.();
}, [initOps]);
```

Update the main content section (around line 80-85) to include sidebar:

```typescript
{/* Main app content */}
{shouldShowMainContent && (
  <div className="flex h-full">
    <div className="flex-1 min-w-0">
      <Outlet />
      <HistorySidebar />
    </div>

    {/* Ops Inbox Sidebar */}
    {opsInboxOpen && (
      <aside className="w-96 border-l bg-background flex-shrink-0">
        <OpsInbox onClose={() => setOpsInboxOpen(false)} />
      </aside>
    )}
  </div>
)}
```

**Step 3: Add toggle button to TopBar**

Find and update TopBar component to include Ops toggle button. Add in the header actions area:

```typescript
<Button
  size="icon"
  variant="ghost"
  onClick={() => setOpsInboxOpen(!opsInboxOpen)}
  className="relative"
  title="Ops Inbox"
>
  <Inbox className="h-5 w-5" />
  {pendingCount > 0 && (
    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
      {pendingCount > 9 ? '9+' : pendingCount}
    </span>
  )}
</Button>
```

**Step 4: Verify build succeeds**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

---

## Task 6: Create Runner Agent

**Files:**
- Create: `electron/ops/agents/runner.ts`
- Test: `test/unit/electron/ops/agents/runner.test.ts`

**Step 1: Write the failing test**

Create `test/unit/electron/ops/agents/runner.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/electron/ops/agents/runner.test.ts`
Expected: FAIL (RunnerAgent doesn't exist)

**Step 3: Create RunnerAgent**

Create `electron/ops/agents/runner.ts`:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/electron/ops/agents/runner.test.ts`
Expected: PASS

---

## Task 7: Create Integration Manager

**Files:**
- Create: `electron/ops/integrations/manager.ts`
- Test: `test/unit/electron/ops/integrations/manager.test.ts`

**Step 1: Write the failing test**

Create `test/unit/electron/ops/integrations/manager.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { IntegrationManager } from '../../../../../electron/ops/integrations/manager';

describe('IntegrationManager', () => {
  it('routes email_draft to gmail', async () => {
    const manager = new IntegrationManager();

    // Mock gmail integration
    const mockGmail = {
      createDraft: vi.fn().mockResolvedValue('draft-123'),
    };
    (manager as any).gmail = mockGmail;

    const result = await manager.execute('email_draft', 'Hello...', {
      to: 'test@example.com',
      subject: 'Test',
    });

    expect(result.draft_id).toBe('draft-123');
    expect(mockGmail.createDraft).toHaveBeenCalled();
  });

  it('throws for unknown action type', async () => {
    const manager = new IntegrationManager();

    await expect(
      manager.execute('unknown_type', '', {})
    ).rejects.toThrow('Unknown action type');
  });

  it('throws when integration not configured', async () => {
    const manager = new IntegrationManager();

    await expect(
      manager.execute('email_draft', '', {})
    ).rejects.toThrow('Gmail not configured');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/electron/ops/integrations/manager.test.ts`
Expected: FAIL (IntegrationManager doesn't exist)

**Step 3: Create IntegrationManager**

Create `electron/ops/integrations/manager.ts`:

```typescript
import { OAuth2Client } from 'google-auth-library';
import { GmailIntegration } from './gmail';
import { CalendarIntegration } from './calendar';
import { NotionIntegration } from './notion';
import { DriveSync } from '../sync/drive-sync';

export interface IntegrationConfig {
  google?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
  notion?: {
    apiKey: string;
  };
}

export class IntegrationManager {
  private gmail: GmailIntegration | null = null;
  private calendar: CalendarIntegration | null = null;
  private notion: NotionIntegration | null = null;
  private drive: DriveSync | null = null;

  async initialize(config: IntegrationConfig): Promise<void> {
    if (config.google) {
      const oauth = new OAuth2Client(
        config.google.clientId,
        config.google.clientSecret
      );
      oauth.setCredentials({ refresh_token: config.google.refreshToken });

      this.gmail = new GmailIntegration(oauth);
      this.calendar = new CalendarIntegration(oauth);
      this.drive = new DriveSync(oauth);
    }

    if (config.notion?.apiKey) {
      this.notion = new NotionIntegration(config.notion.apiKey);
    }
  }

  async execute(
    actionType: string,
    content: string,
    metadata: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    switch (actionType) {
      case 'email_draft':
        return this.executeEmailDraft(content, metadata);
      case 'calendar_event':
        return this.executeCalendarEvent(content, metadata);
      case 'notion_page':
        return this.executeNotionPage(content, metadata);
      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }
  }

  private async executeEmailDraft(
    content: string,
    metadata: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!this.gmail) throw new Error('Gmail not configured');

    const draftId = await this.gmail.createDraft({
      to: metadata.to as string,
      subject: metadata.subject as string,
      body: content,
    });

    return { draft_id: draftId };
  }

  private async executeCalendarEvent(
    content: string,
    metadata: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!this.calendar) throw new Error('Calendar not configured');

    const eventData = JSON.parse(content);
    const eventId = await this.calendar.createEvent({
      summary: eventData.summary || metadata.summary as string,
      description: eventData.description,
      start: new Date(eventData.start || metadata.start as string),
      end: new Date(eventData.end || metadata.end as string),
      attendees: eventData.attendees || metadata.attendees as string[],
      addMeetLink: eventData.addMeetLink ?? true,
    });

    return { event_id: eventId };
  }

  private async executeNotionPage(
    content: string,
    metadata: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!this.notion) throw new Error('Notion not configured');

    const pageId = await this.notion.createPage({
      parentId: metadata.parent_id as string,
      title: metadata.title as string,
      content,
    });

    return { page_id: pageId };
  }

  isConfigured(integration: 'gmail' | 'calendar' | 'notion' | 'drive'): boolean {
    switch (integration) {
      case 'gmail':
        return this.gmail !== null;
      case 'calendar':
        return this.calendar !== null;
      case 'notion':
        return this.notion !== null;
      case 'drive':
        return this.drive !== null;
      default:
        return false;
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/electron/ops/integrations/manager.test.ts`
Expected: PASS

---

## Task 8: Wire Runner and IntegrationManager into OpsLayer

**Files:**
- Modify: `electron/ops/index.ts`

**Step 1: Import new components**

Add imports at top of `electron/ops/index.ts`:

```typescript
import { RunnerAgent, ExecutionResult } from './agents/runner';
import { IntegrationManager } from './integrations/manager';
```

**Step 2: Add properties to OpsLayer class**

Add to class properties:

```typescript
private runner: RunnerAgent;
private integrations: IntegrationManager;
```

**Step 3: Initialize in constructor**

In constructor, after miner initialization:

```typescript
this.integrations = new IntegrationManager();
this.runner = new RunnerAgent(this.integrations);
```

**Step 4: Update approve handler to execute**

Replace the `ops:approve-proposal` handler:

```typescript
ipcMain.handle('ops:approve-proposal', async (_, id: string, editedContent?: string) => {
  // Update status
  this.db.updateProposalStatus(id, 'approved');

  // Get proposal
  const proposalRow = this.db.getProposal(id);
  if (!proposalRow) return false;

  // Parse proposal
  const proposal = {
    ...proposalRow,
    metadata: JSON.parse(proposalRow.metadata),
    draft_content: editedContent || proposalRow.draft_content,
  };

  // Execute
  const result = await this.runner.execute(proposal as any);

  // Log decision
  this.db.insertDecision({
    id: uuidv7(),
    timestamp: new Date().toISOString(),
    proposal_id: id,
    decision: 'approved',
    edit_distance: editedContent ? 1 : 0, // Simplified
    execution_result: result.success ? 'success' : 'failure',
    error_message: result.error_message || null,
  });

  // Update proposal status based on execution
  this.db.updateProposalStatus(id, result.success ? 'executed' : 'approved');

  // Send execution result to renderer
  this.sendToAllWindows('ops:execution-complete', result);

  // Update counts
  const count = this.db.getPendingProposals().length;
  this.tray?.updatePendingCount(count);
  this.sendToAllWindows('ops:pending-count', count);

  return result.success;
});
```

**Step 5: Add uuidv7 import if missing**

Ensure at top of file:

```typescript
import { v7 as uuidv7 } from 'uuid';
```

**Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "electron/ops" | head -10`
Expected: No errors

---

## Task 9: Run All Tests and Verify Integration

**Files:**
- None (verification only)

**Step 1: Run all Ops tests**

Run: `npx vitest run test/unit/electron/ops`
Expected: All tests pass (should be 12+ tests now)

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors in ops-related files

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Manual verification checklist**

- [ ] App launches without errors
- [ ] Ops Inbox button visible in TopBar
- [ ] Clicking button opens sidebar
- [ ] Sidebar shows "No pending proposals" initially
- [ ] Close button works
- [ ] Private mode toggle works
- [ ] Observation toggle works

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Fix MCP event structure | 3 modify, 1 create |
| 2 | Create IPC bridge preload | 1 modify, 1 create |
| 3 | Update OpsLayer IPC events | 1 modify |
| 4 | Update Zustand store | 1 modify |
| 5 | Integrate OpsInbox sidebar | 3 modify |
| 6 | Create Runner Agent | 1 create, 1 test |
| 7 | Create Integration Manager | 1 create, 1 test |
| 8 | Wire into OpsLayer | 1 modify |
| 9 | Verify integration | 0 (tests only) |

**Total: 9 tasks, ~13 files**

After completing all tasks:
- Use superpowers:finishing-a-development-branch to complete the work
