# Ops Layer Connectivity Fix - Design Document

**Date:** 2026-01-17
**Status:** Validated
**Owner:** Jonas
**Scope:** Fix all connectivity gaps in the Ops Layer to create a working end-to-end system

---

## 1. Problem Statement

The Ops Layer MVP was implemented with well-structured individual components, but they are not connected:

| Component | Status | Issue |
|-----------|--------|-------|
| MCP Server | Broken | Event structure malformed - `source` inside `payload` instead of top-level |
| Integrations | Disconnected | Gmail, Calendar, Notion, Drive classes exist but aren't imported/used |
| OpsInbox UI | Disconnected | Component exists but not rendered in app |
| IPC Bridge | Missing | Renderer store doesn't communicate with main process |
| Runner Agent | Missing | No execution after proposal approval |

**Result:** The system cannot observe, propose, or execute anything.

---

## 2. Goals

- Fix event pipeline so observations flow correctly through Interpreter → Drafter → Policy
- Connect renderer UI to main process via IPC
- Integrate OpsInbox as a sidebar panel in the main app
- Create Runner Agent that executes approved proposals via integrations
- Achieve a working end-to-end flow: Observe → Propose → Approve → Execute

---

## 3. Architecture

### 3.1 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         RENDERER                                 │
├─────────────────────────────────────────────────────────────────┤
│  App Layout ──► OpsInbox Sidebar ──► ProposalCard               │
│       │              │                    │                      │
│       │              ▼                    ▼                      │
│       │         useOpsStore ◄────► window.opsAPI                │
└───────┼─────────────────────────────────┼───────────────────────┘
        │ IPC: show-ops-inbox             │ IPC: ops:*
        ▼                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                          MAIN PROCESS                            │
├─────────────────────────────────────────────────────────────────┤
│                        OpsLayer                                  │
│    ┌──────────┐  ┌─────────────┐  ┌────────────┐                │
│    │ Database │  │ MCP Server  │  │   Tray     │                │
│    └──────────┘  └──────┬──────┘  └────────────┘                │
│                         │                                        │
│    ┌────────────────────▼────────────────────┐                  │
│    │              Event Pipeline              │                  │
│    │  AppObserver + WindowObserver → Events   │                  │
│    └────────────────────┬────────────────────┘                  │
│                         ▼                                        │
│    Interpreter → Drafter → Policy → Proposal                    │
│                                         │                        │
│                         ┌───────────────┴───────────────┐       │
│                         ▼                               ▼       │
│                   [User Approves]              [Auto-decline]   │
│                         │                                        │
│                         ▼                                        │
│    ┌─────────────────────────────────────────┐                  │
│    │              Runner Agent                │                  │
│    │  ┌─────────────────────────────────┐    │                  │
│    │  │      Integration Manager         │    │                  │
│    │  │  Gmail │ Calendar │ Notion │ Drive│   │                  │
│    │  └─────────────────────────────────┘    │                  │
│    └─────────────────────────────────────────┘                  │
│                         │                                        │
│                         ▼                                        │
│                  ExecutionResult → DecisionLog                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow

1. **Observation:** MCP Server polls for active app/window, emits properly structured `ObservationEvent`
2. **Interpretation:** Events buffer until episode boundary detected, then Interpreter creates `TaskEpisode`
3. **Drafting:** Drafter generates `ProposedAction` based on episode intent
4. **Policy:** Policy Agent evaluates confidence, decides show/auto-decline
5. **Proposal:** Stored in DB, pushed to renderer via IPC, shown in OpsInbox
6. **Decision:** User approves/declines/edits in UI, action sent via IPC to main
7. **Execution:** Runner Agent executes via Integration Manager
8. **Logging:** DecisionLog recorded with execution result

---

## 4. Component Designs

### 4.1 Event Pipeline Fix

**Problem:** Observers emit `source` inside `payload`, but `ObservationEvent` type requires `source` at top level.

**Solution:** Change `emitEvent` signature and observer implementations.

**New emitEvent signature:**
```typescript
private emitEvent(
  eventType: ObservationEventType,
  source: ObservationEvent['source'],
  payload: ObservationEvent['payload']
): void {
  if (!this.isObserving || this.isPrivateMode) return;

  const event: ObservationEvent = {
    id: uuidv7(),
    timestamp: new Date().toISOString(),
    session_id: this.sessionId,
    source,
    event_type: eventType,
    payload,
    redaction_applied: [],
    confidence: 1.0,
  };

  for (const callback of this.callbacks) {
    callback(event);
  }
}
```

**Shared Context:** Both observers share a `currentContext` object:
```typescript
interface CurrentContext {
  app_bundle_id: string;
  app_name: string;
  window_title: string;
  window_id: number;
  url?: string;
}
```

AppObserver updates `app_bundle_id` and `app_name`. WindowObserver updates `window_title` and `window_id`. Events use the merged context.

### 4.2 IPC Bridge

**Preload Script** (`electron/preload/ops.ts`):
```typescript
import { contextBridge, ipcRenderer } from 'electron';

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
    const handler = (_: any, proposal: any) => callback(proposal);
    ipcRenderer.on('ops:new-proposal', handler);
    return () => ipcRenderer.removeListener('ops:new-proposal', handler);
  },
  onPendingCountChanged: (callback: (count: number) => void) => {
    const handler = (_: any, count: number) => callback(count);
    ipcRenderer.on('ops:pending-count', handler);
    return () => ipcRenderer.removeListener('ops:pending-count', handler);
  },
  onExecutionComplete: (callback: (result: any) => void) => {
    const handler = (_: any, result: any) => callback(result);
    ipcRenderer.on('ops:execution-complete', handler);
    return () => ipcRenderer.removeListener('ops:execution-complete', handler);
  },
});
```

**TypeScript Declaration** (`src/types/ops-api.d.ts`):
```typescript
interface OpsAPI {
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
}

declare global {
  interface Window {
    opsAPI: OpsAPI;
  }
}
```

### 4.3 OpsInbox Sidebar Integration

**Location:** Right sidebar panel in main app layout

**Toggle Mechanism:**
- Button in header/toolbar with badge showing pending count
- Tray menu "Open Ops Inbox" triggers `show-ops-inbox` IPC
- Keyboard shortcut (Cmd+Shift+O)

**State Management:**
```typescript
// In app layout
const [opsInboxOpen, setOpsInboxOpen] = useState(false);
const [pendingCount, setPendingCount] = useState(0);

useEffect(() => {
  // Listen for tray trigger
  const cleanup = window.opsAPI?.onPendingCountChanged(setPendingCount);

  // Listen for show-ops-inbox from main
  window.electron?.ipcRenderer.on('show-ops-inbox', () => {
    setOpsInboxOpen(true);
  });

  return cleanup;
}, []);
```

**Layout Structure:**
```tsx
<div className="flex h-screen">
  <main className="flex-1">{/* existing app content */}</main>

  {opsInboxOpen && (
    <aside className="w-96 border-l">
      <OpsInbox onClose={() => setOpsInboxOpen(false)} />
    </aside>
  )}
</div>
```

### 4.4 Runner Agent

**Purpose:** Execute approved proposals via the appropriate integration.

**Interface:**
```typescript
interface ExecutionResult {
  success: boolean;
  action_type: string;
  proposal_id: string;
  result_data?: Record<string, unknown>;
  error_message?: string;
  executed_at: string;
}

class RunnerAgent {
  constructor(private integrations: IntegrationManager) {}

  async execute(proposal: ProposedAction): Promise<ExecutionResult> {
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
        executed_at: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        action_type: proposal.action_type,
        proposal_id: proposal.id,
        error_message: error.message,
        executed_at: new Date().toISOString(),
      };
    }
  }
}
```

### 4.5 Integration Manager

**Purpose:** Unified interface to all integrations with OAuth management.

**Structure:**
```typescript
class IntegrationManager {
  private gmail: GmailIntegration | null = null;
  private calendar: CalendarIntegration | null = null;
  private notion: NotionIntegration | null = null;
  private drive: DriveSync | null = null;

  async initialize(config: IntegrationConfig): Promise<void> {
    // Initialize OAuth client for Google services
    if (config.google) {
      const oauth = await this.getGoogleOAuth(config.google);
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

  private async executeEmailDraft(content: string, metadata: any) {
    if (!this.gmail) throw new Error('Gmail not configured');
    const draftId = await this.gmail.createDraft({
      to: metadata.to,
      subject: metadata.subject,
      body: content,
    });
    return { draft_id: draftId };
  }

  // ... other execute methods
}
```

### 4.6 OAuth Flow

**Google OAuth:**
1. User clicks "Connect Google Account" in settings
2. Open OAuth consent screen in system browser
3. User authorizes, redirect to localhost callback
4. Exchange code for tokens
5. Store refresh token in macOS Keychain
6. Use refresh token to get access tokens as needed

**Token Storage:**
- Refresh tokens: macOS Keychain (secure)
- Access tokens: Memory only (short-lived)

**Token Refresh:**
- On integration init, check if access token valid
- If expired, use refresh token to get new access token
- If refresh fails, prompt user to re-authenticate

---

## 5. File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `electron/ops/mcp-server/index.ts` | Modify | Fix emitEvent signature, add shared context |
| `electron/ops/mcp-server/observers/app-observer.ts` | Modify | Use shared context, emit proper source |
| `electron/ops/mcp-server/observers/window-observer.ts` | Modify | Use shared context, emit proper source |
| `electron/preload/ops.ts` | Create | IPC bridge for renderer |
| `electron/preload/index.ts` | Modify | Include ops preload |
| `src/types/ops-api.d.ts` | Create | TypeScript declarations for window.opsAPI |
| `src/store/opsStore.ts` | Modify | Use IPC instead of local-only state |
| `src/App.tsx` or layout | Modify | Add OpsInbox sidebar |
| `src/components/OpsInbox/index.tsx` | Modify | Add onClose prop, IPC listeners |
| `electron/ops/agents/runner.ts` | Create | Runner Agent |
| `electron/ops/integrations/manager.ts` | Create | Integration Manager |
| `electron/ops/integrations/oauth.ts` | Create | Google OAuth handler |
| `electron/ops/index.ts` | Modify | Wire Runner, IntegrationManager, IPC events |

---

## 6. Testing Strategy

### Unit Tests
- Runner Agent: Mock integrations, verify routing
- Integration Manager: Mock OAuth, verify execution
- Event pipeline: Verify event structure

### Integration Tests
- Full flow: Emit observation → verify proposal in DB
- IPC: Send from renderer → verify main receives

### Manual Testing
- Connect Google account
- Trigger observation by switching apps
- Verify proposal appears in OpsInbox
- Approve → verify draft created in Gmail

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| OAuth token expiry mid-execution | Refresh token before each execution attempt |
| Google API rate limits | Implement exponential backoff, queue executions |
| User denies OAuth | Graceful fallback, show "integration unavailable" |
| AppleScript permission denied | Guide user to enable in System Settings |

---

## 8. Success Criteria

- [ ] Observations emit correctly structured events
- [ ] OpsInbox visible and functional in app
- [ ] Proposals appear in real-time after observation
- [ ] Approve/decline actions persist to database
- [ ] At least one integration (Gmail) executes successfully
- [ ] All existing tests still pass
- [ ] New tests for Runner and IPC bridge

---

## 9. Next Steps

1. Create implementation plan with bite-sized tasks
2. Set up git worktree for isolated development
3. Execute plan using subagent-driven development
