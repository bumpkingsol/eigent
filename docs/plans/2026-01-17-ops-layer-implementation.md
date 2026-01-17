# Eigent Ops Layer MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a computer-aware automation layer that observes user activity, drafts actions, and progressively automates repetitive tasks through an Ops Inbox.

**Architecture:** Local MCP server observes macOS activity and emits events. Eigent's Ops Inbox displays proposals for approval. Agents (Interpreter, Drafter, Policy) process observations into actionable drafts. Playbook Miner detects automation opportunities.

**Tech Stack:**
- Electron + React + TypeScript (existing)
- Zustand for state management
- better-sqlite3 for local persistence
- @modelcontextprotocol/sdk for MCP servers
- Google APIs (Gmail, Calendar, Drive)
- Notion API

---

## Phase 1: Foundation

### Task 1: Add Dependencies and Types

**Files:**
- Modify: `package.json`
- Create: `src/types/ops.ts`
- Create: `electron/ops/types.ts`

**Step 1: Add npm dependencies**

Run:
```bash
npm install better-sqlite3 @modelcontextprotocol/sdk uuid
npm install -D @types/better-sqlite3 @types/uuid
```

**Step 2: Create shared Ops types**

Create `src/types/ops.ts`:

```typescript
// Observation Events
export type ObservationEventType =
  | "app_activated"
  | "window_focused"
  | "url_changed"
  | "dom_snapshot"
  | "text_input"
  | "click"
  | "file_opened"
  | "clipboard_copy";

export interface ObservationEvent {
  id: string;
  timestamp: string;
  session_id: string;
  source: {
    app_bundle_id: string;
    app_name: string;
    window_title: string;
    window_id: number;
    url?: string;
  };
  event_type: ObservationEventType;
  payload: {
    dom_hash?: string;
    dom_excerpt?: string;
    input_field_id?: string;
    input_length?: number;
    click_target?: string;
    file_path?: string;
  };
  redaction_applied: string[];
  confidence: number;
}

// Task Episodes
export interface TaskEpisode {
  id: string;
  created_at: string;
  updated_at: string;
  observation_ids: string[];
  intent: string;
  context: Record<string, unknown>;
  status: "open" | "closed";
}

// Proposals
export type ProposalStatus = "pending" | "approved" | "declined" | "executed";

export interface ProposedAction {
  id: string;
  created_at: string;
  episode_id: string;
  action_type: "email_draft" | "calendar_event" | "notion_page" | "generic";
  title: string;
  summary: string;
  draft_content: string;
  confidence: number;
  risk_level: "low" | "medium" | "high";
  status: ProposalStatus;
  metadata: Record<string, unknown>;
}

// Playbooks
export type PlaybookMode = "suggest" | "shadow" | "approve" | "autopilot";

export interface Playbook {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
  name: string;
  description: string;
  trigger: {
    app_pattern: string;
    url_pattern?: string;
    context_signals: string[];
  };
  actions: PlaybookAction[];
  mode: PlaybookMode;
  max_daily_executions: number;
  stats: {
    total_executions: number;
    successful_executions: number;
    avg_edit_distance: number;
    last_execution?: string;
    dry_runs_completed: number;
  };
}

export interface PlaybookAction {
  type: string;
  tool: string;
  params: Record<string, unknown>;
}

// Decision Log
export interface DecisionLog {
  id: string;
  timestamp: string;
  proposal_id: string;
  decision: "approved" | "declined" | "edited";
  edit_distance?: number;
  execution_result?: "success" | "failure";
  error_message?: string;
}
```

**Step 3: Run type check**

Run: `npm run type-check`
Expected: PASS (no type errors)

**Step 4: Commit**

```bash
git add package.json package-lock.json src/types/ops.ts
git commit -m "feat(ops): add dependencies and core types"
```

---

### Task 2: Set Up Local Database

**Files:**
- Create: `electron/ops/database.ts`
- Create: `electron/ops/migrations/001_initial.sql`
- Test: `test/unit/electron/ops/database.test.ts`

**Step 1: Write the failing test**

Create `test/unit/electron/ops/database.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpsDatabase } from '../../../../electron/ops/database';
import fs from 'fs';
import path from 'path';

describe('OpsDatabase', () => {
  let db: OpsDatabase;
  const testDbPath = path.join(__dirname, 'test-ops.db');

  beforeEach(() => {
    db = new OpsDatabase(testDbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('creates tables on initialization', () => {
    const tables = db.listTables();
    expect(tables).toContain('observations');
    expect(tables).toContain('episodes');
    expect(tables).toContain('proposals');
    expect(tables).toContain('playbooks');
    expect(tables).toContain('decisions');
  });

  it('inserts and retrieves observations', () => {
    const obs = {
      id: 'obs-1',
      timestamp: new Date().toISOString(),
      session_id: 'session-1',
      source: JSON.stringify({ app_bundle_id: 'com.test', app_name: 'Test', window_title: 'Test', window_id: 1 }),
      event_type: 'app_activated',
      payload: JSON.stringify({}),
      redaction_applied: JSON.stringify([]),
      confidence: 0.9,
    };

    db.insertObservation(obs);
    const retrieved = db.getObservation('obs-1');

    expect(retrieved).toBeDefined();
    expect(retrieved?.session_id).toBe('session-1');
  });

  it('inserts and retrieves proposals', () => {
    const proposal = {
      id: 'prop-1',
      created_at: new Date().toISOString(),
      episode_id: 'ep-1',
      action_type: 'email_draft',
      title: 'Reply to John',
      summary: 'Draft reply',
      draft_content: 'Hello John...',
      confidence: 75,
      risk_level: 'low',
      status: 'pending',
      metadata: JSON.stringify({}),
    };

    db.insertProposal(proposal);
    const pending = db.getPendingProposals();

    expect(pending.length).toBe(1);
    expect(pending[0].title).toBe('Reply to John');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/electron/ops/database.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Create migration SQL**

Create `electron/ops/migrations/001_initial.sql`:

```sql
-- Observations table
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  session_id TEXT NOT NULL,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  redaction_applied TEXT NOT NULL,
  confidence REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(session_id);
CREATE INDEX IF NOT EXISTS idx_observations_timestamp ON observations(timestamp);

-- Episodes table
CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  observation_ids TEXT NOT NULL,
  intent TEXT NOT NULL,
  context TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);

CREATE INDEX IF NOT EXISTS idx_episodes_status ON episodes(status);

-- Proposals table
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  draft_content TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_episode ON proposals(episode_id);

-- Playbooks table
CREATE TABLE IF NOT EXISTS playbooks (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  trigger TEXT NOT NULL,
  actions TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'suggest',
  max_daily_executions INTEGER NOT NULL DEFAULT 50,
  stats TEXT NOT NULL
);

-- Decisions table
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  edit_distance REAL,
  execution_result TEXT,
  error_message TEXT,
  FOREIGN KEY (proposal_id) REFERENCES proposals(id)
);

CREATE INDEX IF NOT EXISTS idx_decisions_proposal ON decisions(proposal_id);
```

**Step 4: Implement OpsDatabase**

Create `electron/ops/database.ts`:

```typescript
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export class OpsDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    const migrationPath = path.join(__dirname, 'migrations', '001_initial.sql');
    const migration = fs.readFileSync(migrationPath, 'utf-8');
    this.db.exec(migration);
  }

  listTables(): string[] {
    const rows = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all() as { name: string }[];
    return rows.map(r => r.name);
  }

  // Observations
  insertObservation(obs: {
    id: string;
    timestamp: string;
    session_id: string;
    source: string;
    event_type: string;
    payload: string;
    redaction_applied: string;
    confidence: number;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO observations (id, timestamp, session_id, source, event_type, payload, redaction_applied, confidence)
      VALUES (@id, @timestamp, @session_id, @source, @event_type, @payload, @redaction_applied, @confidence)
    `);
    stmt.run(obs);
  }

  getObservation(id: string): {
    id: string;
    timestamp: string;
    session_id: string;
    source: string;
    event_type: string;
    payload: string;
    redaction_applied: string;
    confidence: number;
  } | undefined {
    return this.db.prepare('SELECT * FROM observations WHERE id = ?').get(id) as any;
  }

  getRecentObservations(limit: number = 100): any[] {
    return this.db.prepare(
      'SELECT * FROM observations ORDER BY timestamp DESC LIMIT ?'
    ).all(limit);
  }

  // Proposals
  insertProposal(proposal: {
    id: string;
    created_at: string;
    episode_id: string;
    action_type: string;
    title: string;
    summary: string;
    draft_content: string;
    confidence: number;
    risk_level: string;
    status: string;
    metadata: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO proposals (id, created_at, episode_id, action_type, title, summary, draft_content, confidence, risk_level, status, metadata)
      VALUES (@id, @created_at, @episode_id, @action_type, @title, @summary, @draft_content, @confidence, @risk_level, @status, @metadata)
    `);
    stmt.run(proposal);
  }

  getPendingProposals(): any[] {
    return this.db.prepare(
      "SELECT * FROM proposals WHERE status = 'pending' ORDER BY created_at DESC"
    ).all();
  }

  updateProposalStatus(id: string, status: string): void {
    this.db.prepare(
      'UPDATE proposals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(status, id);
  }

  getProposal(id: string): any {
    return this.db.prepare('SELECT * FROM proposals WHERE id = ?').get(id);
  }

  // Playbooks
  insertPlaybook(playbook: {
    id: string;
    created_at: string;
    updated_at: string;
    name: string;
    description: string;
    trigger: string;
    actions: string;
    mode: string;
    max_daily_executions: number;
    stats: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO playbooks (id, created_at, updated_at, name, description, trigger, actions, mode, max_daily_executions, stats)
      VALUES (@id, @created_at, @updated_at, @name, @description, @trigger, @actions, @mode, @max_daily_executions, @stats)
    `);
    stmt.run(playbook);
  }

  getAllPlaybooks(): any[] {
    return this.db.prepare('SELECT * FROM playbooks ORDER BY updated_at DESC').all();
  }

  // Decisions
  insertDecision(decision: {
    id: string;
    timestamp: string;
    proposal_id: string;
    decision: string;
    edit_distance?: number;
    execution_result?: string;
    error_message?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO decisions (id, timestamp, proposal_id, decision, edit_distance, execution_result, error_message)
      VALUES (@id, @timestamp, @proposal_id, @decision, @edit_distance, @execution_result, @error_message)
    `);
    stmt.run(decision);
  }

  close(): void {
    this.db.close();
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- test/unit/electron/ops/database.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add electron/ops/ test/unit/electron/ops/
git commit -m "feat(ops): add local SQLite database with migrations"
```

---

### Task 3: Create Ops Zustand Store

**Files:**
- Create: `src/store/opsStore.ts`
- Test: `test/unit/store/opsStore.test.ts`

**Step 1: Write the failing test**

Create `test/unit/store/opsStore.test.ts`:

```typescript
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
    const store = getOpsStore();
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

    store.addProposal(proposal);

    expect(store.proposals.length).toBe(1);
    expect(store.pendingCount).toBe(1);
  });

  it('approves a proposal and decrements pending count', () => {
    const store = getOpsStore();
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

    store.addProposal(proposal);
    store.approveProposal('prop-1');

    expect(store.proposals[0].status).toBe('approved');
    expect(store.pendingCount).toBe(0);
  });

  it('toggles private mode', () => {
    const store = getOpsStore();

    expect(store.isPrivateMode).toBe(false);
    store.togglePrivateMode();
    expect(store.isPrivateMode).toBe(true);
    store.togglePrivateMode();
    expect(store.isPrivateMode).toBe(false);
  });

  it('toggles observation state', () => {
    const store = getOpsStore();

    store.setObserving(true);
    expect(store.isObserving).toBe(true);
    store.setObserving(false);
    expect(store.isObserving).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/store/opsStore.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Implement opsStore**

Create `src/store/opsStore.ts`:

```typescript
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
    (set, get) => ({
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

      approveProposal: (id) => set((state) => ({
        proposals: state.proposals.map((p) =>
          p.id === id ? { ...p, status: 'approved' as const } : p
        ),
        pendingCount: Math.max(0, state.pendingCount - 1),
      })),

      declineProposal: (id) => set((state) => ({
        proposals: state.proposals.map((p) =>
          p.id === id ? { ...p, status: 'declined' as const } : p
        ),
        pendingCount: Math.max(0, state.pendingCount - 1),
      })),

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
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/store/opsStore.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/store/opsStore.ts test/unit/store/opsStore.test.ts
git commit -m "feat(ops): add Zustand store for Ops Inbox state"
```

---

### Task 4: Create Ops Inbox UI Components

**Files:**
- Create: `src/components/OpsInbox/index.tsx`
- Create: `src/components/OpsInbox/ProposalCard.tsx`
- Create: `src/components/OpsInbox/OpsInbox.css`

**Step 1: Create ProposalCard component**

Create `src/components/OpsInbox/ProposalCard.tsx`:

```typescript
import { Check, X, Edit, Clock, Mail, Calendar, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ProposedAction } from '@/types/ops';

interface ProposalCardProps {
  proposal: ProposedAction;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  onEdit: (id: string) => void;
}

const actionIcons = {
  email_draft: Mail,
  calendar_event: Calendar,
  notion_page: FileText,
  generic: FileText,
};

const confidenceColors = {
  low: 'bg-red-100 text-red-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-green-100 text-green-800',
};

function getConfidenceLevel(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence < 30) return 'low';
  if (confidence < 70) return 'medium';
  return 'high';
}

export function ProposalCard({ proposal, onApprove, onDecline, onEdit }: ProposalCardProps) {
  const Icon = actionIcons[proposal.action_type] || FileText;
  const confidenceLevel = getConfidenceLevel(proposal.confidence);
  const isPending = proposal.status === 'pending';

  return (
    <Card className={cn(
      'transition-all',
      !isPending && 'opacity-60'
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">{proposal.title}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={confidenceColors[confidenceLevel]}>
              {proposal.confidence}%
            </Badge>
            {proposal.risk_level !== 'low' && (
              <Badge variant="destructive">{proposal.risk_level} risk</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-2">
        <p className="text-sm text-muted-foreground">{proposal.summary}</p>
        {proposal.draft_content && (
          <div className="mt-2 p-2 bg-muted rounded text-sm font-mono whitespace-pre-wrap max-h-32 overflow-auto">
            {proposal.draft_content.substring(0, 200)}
            {proposal.draft_content.length > 200 && '...'}
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-2">
        {isPending ? (
          <div className="flex gap-2 w-full">
            <Button
              size="sm"
              variant="default"
              className="flex-1"
              onClick={() => onApprove(proposal.id)}
            >
              <Check className="h-4 w-4 mr-1" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(proposal.id)}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDecline(proposal.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            {proposal.status === 'approved' ? 'Approved' : 'Declined'}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
```

**Step 2: Create OpsInbox main component**

Create `src/components/OpsInbox/index.tsx`:

```typescript
import { useState } from 'react';
import { Inbox, Pause, Play, EyeOff, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOpsStore } from '@/store/opsStore';
import { ProposalCard } from './ProposalCard';
import type { ProposedAction } from '@/types/ops';

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
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-2">
          <TabsTrigger value="pending" className="flex-1">
            Pending ({pendingProposals.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1">
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="flex-1 mt-0">
          <ScrollArea className="h-full p-4">
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
          </ScrollArea>
        </TabsContent>

        <TabsContent value="history" className="flex-1 mt-0">
          <ScrollArea className="h-full p-4">
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
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export { ProposalCard } from './ProposalCard';
```

**Step 3: Run type check**

Run: `npm run type-check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/OpsInbox/
git commit -m "feat(ops): add OpsInbox UI components"
```

---

### Task 5: Add Menu Bar Tray and Notifications

**Files:**
- Create: `electron/ops/tray.ts`
- Modify: `electron/main/index.ts`

**Step 1: Create tray manager**

Create `electron/ops/tray.ts`:

```typescript
import { Tray, Menu, nativeImage, Notification, app } from 'electron';
import path from 'path';

export class OpsTray {
  private tray: Tray | null = null;
  private pendingCount: number = 0;

  constructor(private onOpenOpsInbox: () => void) {}

  init(): void {
    // Create tray icon
    const iconPath = path.join(__dirname, '../../assets/tray-icon.png');
    const icon = nativeImage.createFromPath(iconPath);

    this.tray = new Tray(icon.resize({ width: 16, height: 16 }));
    this.tray.setToolTip('Eigent Ops');
    this.updateMenu();

    this.tray.on('click', () => {
      this.onOpenOpsInbox();
    });
  }

  updatePendingCount(count: number): void {
    this.pendingCount = count;
    this.updateMenu();

    if (this.tray) {
      this.tray.setTitle(count > 0 ? `${count}` : '');
    }
  }

  private updateMenu(): void {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Ops Inbox ${this.pendingCount > 0 ? `(${this.pendingCount})` : ''}`,
        click: () => this.onOpenOpsInbox(),
      },
      { type: 'separator' },
      {
        label: 'Pause Observation',
        type: 'checkbox',
        checked: false,
        click: (menuItem) => {
          // TODO: Emit pause event
          console.log('Pause:', menuItem.checked);
        },
      },
      {
        label: 'Private Mode',
        type: 'checkbox',
        checked: false,
        accelerator: 'CmdOrCtrl+Shift+P',
        click: (menuItem) => {
          // TODO: Emit private mode event
          console.log('Private Mode:', menuItem.checked);
        },
      },
      { type: 'separator' },
      {
        label: 'Quit Eigent',
        click: () => app.quit(),
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  showProposalNotification(title: string, body: string, proposalId: string): void {
    if (!Notification.isSupported()) return;

    const notification = new Notification({
      title,
      body,
      silent: false,
    });

    notification.on('click', () => {
      this.onOpenOpsInbox();
    });

    notification.show();
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
```

**Step 2: Create tray icon asset**

Create a simple 16x16 PNG at `assets/tray-icon.png` (or use existing app icon)

**Step 3: Wire tray into main process**

Add to `electron/main/index.ts` (find appropriate location):

```typescript
import { OpsTray } from '../ops/tray';

let opsTray: OpsTray | null = null;

// In app.whenReady():
opsTray = new OpsTray(() => {
  // Focus main window and show Ops Inbox
  if (mainWindow) {
    mainWindow.show();
    mainWindow.webContents.send('show-ops-inbox');
  }
});
opsTray.init();

// In app.on('before-quit'):
opsTray?.destroy();
```

**Step 4: Add IPC handler for pending count updates**

```typescript
import { ipcMain } from 'electron';

ipcMain.on('ops-pending-count', (_, count: number) => {
  opsTray?.updatePendingCount(count);
});

ipcMain.on('ops-show-notification', (_, { title, body, proposalId }) => {
  opsTray?.showProposalNotification(title, body, proposalId);
});
```

**Step 5: Commit**

```bash
git add electron/ops/tray.ts electron/main/index.ts assets/
git commit -m "feat(ops): add system tray and native notifications"
```

---

### Task 6: Create Computer MCP Server (Observation)

**Files:**
- Create: `electron/ops/mcp-server/index.ts`
- Create: `electron/ops/mcp-server/observers/app-observer.ts`
- Create: `electron/ops/mcp-server/observers/window-observer.ts`

**Step 1: Create main MCP server**

Create `electron/ops/mcp-server/index.ts`:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { v7 as uuidv7 } from 'uuid';
import { AppObserver } from './observers/app-observer';
import { WindowObserver } from './observers/window-observer';

interface ObservationCallback {
  (event: any): void;
}

export class ComputerMcpServer {
  private server: Server;
  private appObserver: AppObserver;
  private windowObserver: WindowObserver;
  private sessionId: string;
  private isObserving: boolean = false;
  private isPrivateMode: boolean = false;
  private callbacks: ObservationCallback[] = [];

  constructor() {
    this.sessionId = uuidv7();
    this.server = new Server(
      { name: 'eigent-computer', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    this.appObserver = new AppObserver(this.emitEvent.bind(this));
    this.windowObserver = new WindowObserver(this.emitEvent.bind(this));

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'start_observation',
          description: 'Start observing user activity',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'stop_observation',
          description: 'Stop observing user activity',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'get_current_context',
          description: 'Get current app and window context',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'set_private_mode',
          description: 'Enable or disable private mode',
          inputSchema: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
            },
            required: ['enabled'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'start_observation':
          return this.startObservation();
        case 'stop_observation':
          return this.stopObservation();
        case 'get_current_context':
          return this.getCurrentContext();
        case 'set_private_mode':
          return this.setPrivateMode((args as any).enabled);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private emitEvent(eventType: string, payload: any): void {
    if (!this.isObserving || this.isPrivateMode) return;

    const event = {
      id: uuidv7(),
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      event_type: eventType,
      payload,
      redaction_applied: [],
      confidence: 1.0,
    };

    for (const callback of this.callbacks) {
      callback(event);
    }
  }

  private startObservation() {
    this.isObserving = true;
    this.appObserver.start();
    this.windowObserver.start();
    return { content: [{ type: 'text', text: 'Observation started' }] };
  }

  private stopObservation() {
    this.isObserving = false;
    this.appObserver.stop();
    this.windowObserver.stop();
    return { content: [{ type: 'text', text: 'Observation stopped' }] };
  }

  private getCurrentContext() {
    const appContext = this.appObserver.getCurrentApp();
    const windowContext = this.windowObserver.getCurrentWindow();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ app: appContext, window: windowContext }, null, 2),
      }],
    };
  }

  private setPrivateMode(enabled: boolean) {
    this.isPrivateMode = enabled;
    if (enabled) {
      // In private mode, we don't emit events
      this.sessionId = uuidv7(); // New session when exiting
    }
    return {
      content: [{
        type: 'text',
        text: `Private mode ${enabled ? 'enabled' : 'disabled'}`,
      }],
    };
  }

  onEvent(callback: ObservationCallback): void {
    this.callbacks.push(callback);
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Run if executed directly
if (require.main === module) {
  const server = new ComputerMcpServer();
  server.start().catch(console.error);
}
```

**Step 2: Create App Observer**

Create `electron/ops/mcp-server/observers/app-observer.ts`:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface AppInfo {
  bundle_id: string;
  name: string;
  is_frontmost: boolean;
}

export class AppObserver {
  private intervalId: NodeJS.Timeout | null = null;
  private lastApp: string | null = null;
  private pollInterval: number = 1000; // 1 second

  constructor(private onEvent: (type: string, payload: any) => void) {}

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
      const currentApp = await this.getFrontmostApp();

      if (currentApp && currentApp.bundle_id !== this.lastApp) {
        this.lastApp = currentApp.bundle_id;
        this.onEvent('app_activated', {
          source: {
            app_bundle_id: currentApp.bundle_id,
            app_name: currentApp.name,
          },
        });
      }
    } catch (error) {
      // Silently ignore polling errors
    }
  }

  private async getFrontmostApp(): Promise<AppInfo | null> {
    // macOS AppleScript to get frontmost app
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
      const [bundle_id, name] = stdout.trim().split('|');
      return { bundle_id, name, is_frontmost: true };
    } catch {
      return null;
    }
  }

  getCurrentApp(): AppInfo | null {
    if (!this.lastApp) return null;
    return {
      bundle_id: this.lastApp,
      name: '',
      is_frontmost: true,
    };
  }
}
```

**Step 3: Create Window Observer**

Create `electron/ops/mcp-server/observers/window-observer.ts`:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface WindowInfo {
  title: string;
  window_id: number;
  app_name: string;
}

export class WindowObserver {
  private intervalId: NodeJS.Timeout | null = null;
  private lastWindow: string | null = null;
  private pollInterval: number = 500; // 500ms

  constructor(private onEvent: (type: string, payload: any) => void) {}

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

      if (window && window.title !== this.lastWindow) {
        this.lastWindow = window.title;
        this.onEvent('window_focused', {
          source: {
            window_title: window.title,
            window_id: window.window_id,
            app_name: window.app_name,
          },
        });
      }
    } catch (error) {
      // Silently ignore polling errors
    }
  }

  private async getFrontmostWindow(): Promise<WindowInfo | null> {
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
      const [app_name, title] = stdout.trim().split('|');
      return { title: title || '', window_id: 0, app_name };
    } catch {
      return null;
    }
  }

  getCurrentWindow(): WindowInfo | null {
    return this.lastWindow ? { title: this.lastWindow, window_id: 0, app_name: '' } : null;
  }
}
```

**Step 4: Commit**

```bash
git add electron/ops/mcp-server/
git commit -m "feat(ops): add Computer MCP Server with app/window observation"
```

---

## Phase 2: Core Integrations

### Task 7: Gmail Integration (MCP Server)

**Files:**
- Create: `electron/ops/integrations/gmail/index.ts`
- Create: `electron/ops/integrations/gmail/auth.ts`

**Step 1: Create Gmail MCP integration**

Create `electron/ops/integrations/gmail/index.ts`:

```typescript
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}

export interface Email {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
}

export class GmailIntegration {
  private gmail: any;

  constructor(private auth: OAuth2Client) {
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async getRecentEmails(maxResults: number = 10): Promise<Email[]> {
    const response = await this.gmail.users.messages.list({
      userId: 'me',
      maxResults,
      labelIds: ['INBOX'],
    });

    const messages = response.data.messages || [];
    const emails: Email[] = [];

    for (const msg of messages.slice(0, 5)) {
      const detail = await this.gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      });

      const headers = detail.data.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h: any) => h.name === name)?.value || '';

      emails.push({
        id: msg.id,
        threadId: msg.threadId,
        from: getHeader('From'),
        to: getHeader('To'),
        subject: getHeader('Subject'),
        snippet: detail.data.snippet || '',
        date: getHeader('Date'),
      });
    }

    return emails;
  }

  async createDraft(draft: EmailDraft): Promise<string> {
    const message = this.createMimeMessage(draft);
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await this.gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: encodedMessage,
          threadId: draft.replyTo,
        },
      },
    });

    return response.data.id;
  }

  async sendDraft(draftId: string): Promise<void> {
    await this.gmail.users.drafts.send({
      userId: 'me',
      requestBody: { id: draftId },
    });
  }

  async deleteDraft(draftId: string): Promise<void> {
    await this.gmail.users.drafts.delete({
      userId: 'me',
      id: draftId,
    });
  }

  private createMimeMessage(draft: EmailDraft): string {
    const lines = [
      `To: ${draft.to}`,
      `Subject: ${draft.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      draft.body,
    ];
    return lines.join('\r\n');
  }
}
```

**Step 2: Create Gmail auth helper**

Create `electron/ops/integrations/gmail/auth.ts`:

```typescript
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
];

export class GmailAuth {
  private oauth2Client: OAuth2Client;
  private tokenPath: string;

  constructor(credentialsPath: string, tokenPath: string) {
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

    this.oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    this.tokenPath = tokenPath;
  }

  async getAuthenticatedClient(): Promise<OAuth2Client> {
    // Try to load existing token
    if (fs.existsSync(this.tokenPath)) {
      const token = JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8'));
      this.oauth2Client.setCredentials(token);
      return this.oauth2Client;
    }

    // Need to authenticate
    throw new Error('Not authenticated. Call authenticate() first.');
  }

  async authenticate(): Promise<OAuth2Client> {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });

    // Open auth URL in browser window
    const authWindow = new BrowserWindow({
      width: 600,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
      },
    });

    authWindow.loadURL(authUrl);

    return new Promise((resolve, reject) => {
      authWindow.webContents.on('will-redirect', async (event, url) => {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');

        if (code) {
          try {
            const { tokens } = await this.oauth2Client.getToken(code);
            this.oauth2Client.setCredentials(tokens);

            // Save token
            fs.writeFileSync(this.tokenPath, JSON.stringify(tokens));

            authWindow.close();
            resolve(this.oauth2Client);
          } catch (error) {
            reject(error);
          }
        }
      });

      authWindow.on('closed', () => {
        reject(new Error('Auth window closed'));
      });
    });
  }

  isAuthenticated(): boolean {
    return fs.existsSync(this.tokenPath);
  }
}
```

**Step 3: Commit**

```bash
git add electron/ops/integrations/gmail/
git commit -m "feat(ops): add Gmail integration for email drafting"
```

---

### Task 8: Google Calendar Integration

**Files:**
- Create: `electron/ops/integrations/calendar/index.ts`

**Step 1: Create Calendar integration**

Create `electron/ops/integrations/calendar/index.ts`:

```typescript
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  attendees: string[];
  meetLink?: string;
}

export interface CreateEventParams {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  attendees?: string[];
  addMeetLink?: boolean;
}

export interface TimeSlot {
  start: Date;
  end: Date;
}

export class CalendarIntegration {
  private calendar: calendar_v3.Calendar;

  constructor(auth: OAuth2Client) {
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  async getUpcomingEvents(maxResults: number = 10): Promise<CalendarEvent[]> {
    const response = await this.calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (response.data.items || []).map((event) => ({
      id: event.id || '',
      summary: event.summary || '',
      description: event.description,
      start: event.start?.dateTime || event.start?.date || '',
      end: event.end?.dateTime || event.end?.date || '',
      attendees: (event.attendees || []).map((a) => a.email || ''),
      meetLink: event.hangoutLink,
    }));
  }

  async createEvent(params: CreateEventParams): Promise<string> {
    const event: calendar_v3.Schema$Event = {
      summary: params.summary,
      description: params.description,
      start: { dateTime: params.start.toISOString() },
      end: { dateTime: params.end.toISOString() },
      attendees: params.attendees?.map((email) => ({ email })),
    };

    if (params.addMeetLink) {
      event.conferenceData = {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const response = await this.calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      conferenceDataVersion: params.addMeetLink ? 1 : 0,
    });

    return response.data.id || '';
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.calendar.events.delete({
      calendarId: 'primary',
      eventId,
    });
  }

  async updateEvent(eventId: string, updates: Partial<CreateEventParams>): Promise<void> {
    const patch: calendar_v3.Schema$Event = {};

    if (updates.summary) patch.summary = updates.summary;
    if (updates.description) patch.description = updates.description;
    if (updates.start) patch.start = { dateTime: updates.start.toISOString() };
    if (updates.end) patch.end = { dateTime: updates.end.toISOString() };
    if (updates.attendees) patch.attendees = updates.attendees.map((email) => ({ email }));

    await this.calendar.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: patch,
    });
  }

  async findAvailableSlots(
    attendees: string[],
    duration: number, // minutes
    startDate: Date,
    endDate: Date
  ): Promise<TimeSlot[]> {
    const response = await this.calendar.freebusy.query({
      requestBody: {
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        items: [
          { id: 'primary' },
          ...attendees.map((email) => ({ id: email })),
        ],
      },
    });

    // Find gaps in busy times (simplified)
    const slots: TimeSlot[] = [];
    const busyTimes = response.data.calendars?.primary?.busy || [];

    let current = new Date(startDate);
    const durationMs = duration * 60 * 1000;

    for (const busy of busyTimes) {
      const busyStart = new Date(busy.start || '');

      while (current.getTime() + durationMs <= busyStart.getTime()) {
        slots.push({
          start: new Date(current),
          end: new Date(current.getTime() + durationMs),
        });
        current = new Date(current.getTime() + 30 * 60 * 1000); // 30 min increments
      }

      current = new Date(busy.end || '');
    }

    return slots.slice(0, 5); // Return top 5 slots
  }
}
```

**Step 2: Commit**

```bash
git add electron/ops/integrations/calendar/
git commit -m "feat(ops): add Google Calendar integration"
```

---

### Task 9: Notion Integration

**Files:**
- Create: `electron/ops/integrations/notion/index.ts`

**Step 1: Create Notion integration**

Create `electron/ops/integrations/notion/index.ts`:

```typescript
import { Client } from '@notionhq/client';

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  lastEdited: string;
}

export interface CreatePageParams {
  parentId: string;
  title: string;
  content?: string;
  properties?: Record<string, any>;
}

export class NotionIntegration {
  private notion: Client;

  constructor(apiKey: string) {
    this.notion = new Client({ auth: apiKey });
  }

  async searchPages(query: string, limit: number = 10): Promise<NotionPage[]> {
    const response = await this.notion.search({
      query,
      filter: { property: 'object', value: 'page' },
      page_size: limit,
    });

    return response.results
      .filter((r): r is any => r.object === 'page')
      .map((page) => ({
        id: page.id,
        title: this.extractTitle(page),
        url: page.url,
        lastEdited: page.last_edited_time,
      }));
  }

  async createPage(params: CreatePageParams): Promise<string> {
    const response = await this.notion.pages.create({
      parent: { page_id: params.parentId },
      properties: {
        title: {
          title: [{ text: { content: params.title } }],
        },
        ...params.properties,
      },
      children: params.content
        ? [
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [{ type: 'text', text: { content: params.content } }],
              },
            },
          ]
        : [],
    });

    return response.id;
  }

  async appendToPage(pageId: string, content: string): Promise<void> {
    await this.notion.blocks.children.append({
      block_id: pageId,
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content } }],
          },
        },
      ],
    });
  }

  async archivePage(pageId: string): Promise<void> {
    await this.notion.pages.update({
      page_id: pageId,
      archived: true,
    });
  }

  async getPage(pageId: string): Promise<NotionPage | null> {
    try {
      const page = await this.notion.pages.retrieve({ page_id: pageId }) as any;
      return {
        id: page.id,
        title: this.extractTitle(page),
        url: page.url,
        lastEdited: page.last_edited_time,
      };
    } catch {
      return null;
    }
  }

  private extractTitle(page: any): string {
    const titleProp = page.properties?.title || page.properties?.Name;
    if (titleProp?.title?.[0]?.plain_text) {
      return titleProp.title[0].plain_text;
    }
    return 'Untitled';
  }
}
```

**Step 2: Add @notionhq/client dependency**

Run:
```bash
npm install @notionhq/client
```

**Step 3: Commit**

```bash
git add electron/ops/integrations/notion/ package.json package-lock.json
git commit -m "feat(ops): add Notion integration for page management"
```

---

### Task 10: Google Drive Sync

**Files:**
- Create: `electron/ops/sync/drive-sync.ts`

**Step 1: Create Drive sync manager**

Create `electron/ops/sync/drive-sync.ts`:

```typescript
import { google, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const EIGENT_FOLDER_NAME = 'Eigent';

export class DriveSync {
  private drive: drive_v3.Drive;
  private folderId: string | null = null;
  private encryptionKey: Buffer | null = null;

  constructor(auth: OAuth2Client) {
    this.drive = google.drive({ version: 'v3', auth });
  }

  async init(passphrase: string): Promise<void> {
    // Derive encryption key from passphrase
    this.encryptionKey = crypto.pbkdf2Sync(passphrase, 'eigent-salt', 100000, 32, 'sha256');

    // Find or create Eigent folder
    this.folderId = await this.getOrCreateFolder();
  }

  private async getOrCreateFolder(): Promise<string> {
    // Search for existing folder
    const response = await this.drive.files.list({
      q: `name='${EIGENT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      spaces: 'drive',
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id!;
    }

    // Create folder
    const folder = await this.drive.files.create({
      requestBody: {
        name: EIGENT_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      },
    });

    return folder.data.id!;
  }

  async uploadFile(localPath: string, remoteName: string): Promise<string> {
    if (!this.folderId || !this.encryptionKey) {
      throw new Error('DriveSync not initialized');
    }

    // Read and encrypt file
    const content = fs.readFileSync(localPath, 'utf-8');
    const encrypted = this.encrypt(content);

    // Check if file exists
    const existing = await this.findFile(remoteName);

    if (existing) {
      // Update existing
      await this.drive.files.update({
        fileId: existing,
        media: {
          mimeType: 'application/octet-stream',
          body: encrypted,
        },
      });
      return existing;
    }

    // Create new
    const response = await this.drive.files.create({
      requestBody: {
        name: remoteName,
        parents: [this.folderId],
      },
      media: {
        mimeType: 'application/octet-stream',
        body: encrypted,
      },
    });

    return response.data.id!;
  }

  async downloadFile(remoteName: string, localPath: string): Promise<boolean> {
    if (!this.encryptionKey) {
      throw new Error('DriveSync not initialized');
    }

    const fileId = await this.findFile(remoteName);
    if (!fileId) return false;

    const response = await this.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' }
    );

    const decrypted = this.decrypt(response.data as string);

    // Ensure directory exists
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(localPath, decrypted);
    return true;
  }

  async syncPlaybooks(localDir: string): Promise<void> {
    // Upload all playbooks
    const files = fs.readdirSync(localDir).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      await this.uploadFile(path.join(localDir, file), `playbooks/${file}`);
    }
  }

  private async findFile(name: string): Promise<string | null> {
    const response = await this.drive.files.list({
      q: `name='${name}' and '${this.folderId}' in parents and trashed=false`,
      spaces: 'drive',
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id!;
    }
    return null;
  }

  private encrypt(plaintext: string): string {
    if (!this.encryptionKey) throw new Error('No encryption key');

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    return JSON.stringify({
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      data: encrypted,
    });
  }

  private decrypt(ciphertext: string): string {
    if (!this.encryptionKey) throw new Error('No encryption key');

    const { iv, authTag, data } = JSON.parse(ciphertext);

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    let decrypted = decipher.update(data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
```

**Step 2: Commit**

```bash
git add electron/ops/sync/
git commit -m "feat(ops): add encrypted Google Drive sync for playbooks"
```

---

## Phase 3: Intelligence

### Task 11: Interpreter Agent

**Files:**
- Create: `electron/ops/agents/interpreter.ts`
- Test: `test/unit/electron/ops/agents/interpreter.test.ts`

**Step 1: Write the failing test**

Create `test/unit/electron/ops/agents/interpreter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { InterpreterAgent } from '../../../../electron/ops/agents/interpreter';
import type { ObservationEvent } from '../../../../src/types/ops';

describe('InterpreterAgent', () => {
  const agent = new InterpreterAgent();

  it('creates episode from email observations', () => {
    const observations: ObservationEvent[] = [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        session_id: 'session-1',
        source: {
          app_bundle_id: 'com.google.Chrome',
          app_name: 'Google Chrome',
          window_title: 'Inbox - Gmail',
          window_id: 1,
          url: 'https://mail.google.com',
        },
        event_type: 'window_focused',
        payload: {},
        redaction_applied: [],
        confidence: 1.0,
      },
      {
        id: '2',
        timestamp: new Date().toISOString(),
        session_id: 'session-1',
        source: {
          app_bundle_id: 'com.google.Chrome',
          app_name: 'Google Chrome',
          window_title: 'RE: Meeting Tomorrow - Gmail',
          window_id: 1,
          url: 'https://mail.google.com/mail/u/0/#inbox/abc123',
        },
        event_type: 'window_focused',
        payload: { dom_excerpt: 'Hi, can we reschedule...' },
        redaction_applied: [],
        confidence: 1.0,
      },
    ];

    const episode = agent.interpret(observations);

    expect(episode).toBeDefined();
    expect(episode.intent).toContain('email');
    expect(episode.observation_ids).toHaveLength(2);
  });

  it('detects episode boundary on app switch', () => {
    const observations: ObservationEvent[] = [
      {
        id: '1',
        timestamp: '2026-01-17T10:00:00.000Z',
        session_id: 'session-1',
        source: {
          app_bundle_id: 'com.google.Chrome',
          app_name: 'Chrome',
          window_title: 'Gmail',
          window_id: 1,
        },
        event_type: 'app_activated',
        payload: {},
        redaction_applied: [],
        confidence: 1.0,
      },
      {
        id: '2',
        timestamp: '2026-01-17T10:01:00.000Z',
        session_id: 'session-1',
        source: {
          app_bundle_id: 'com.apple.finder',
          app_name: 'Finder',
          window_title: 'Documents',
          window_id: 2,
        },
        event_type: 'app_activated',
        payload: {},
        redaction_applied: [],
        confidence: 1.0,
      },
    ];

    const shouldClose = agent.shouldCloseEpisode(observations[0], observations[1]);
    expect(shouldClose).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/electron/ops/agents/interpreter.test.ts`
Expected: FAIL

**Step 3: Implement InterpreterAgent**

Create `electron/ops/agents/interpreter.ts`:

```typescript
import { v7 as uuidv7 } from 'uuid';
import type { ObservationEvent, TaskEpisode } from '../../src/types/ops';

interface IntentPattern {
  pattern: RegExp;
  intent: string;
  confidence: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  { pattern: /gmail|mail\.google/i, intent: 'email_interaction', confidence: 0.8 },
  { pattern: /calendar\.google/i, intent: 'calendar_interaction', confidence: 0.8 },
  { pattern: /notion\.so/i, intent: 'notion_interaction', confidence: 0.8 },
  { pattern: /slack/i, intent: 'messaging', confidence: 0.7 },
];

const UNRELATED_APPS = [
  'com.apple.finder',
  'com.apple.Preview',
  'com.spotify.client',
  'com.apple.Music',
];

export class InterpreterAgent {
  private episodeTimeout = 5 * 60 * 1000; // 5 minutes

  interpret(observations: ObservationEvent[]): TaskEpisode | null {
    if (observations.length === 0) return null;

    const intent = this.detectIntent(observations);
    const context = this.extractContext(observations);

    return {
      id: uuidv7(),
      created_at: observations[0].timestamp,
      updated_at: observations[observations.length - 1].timestamp,
      observation_ids: observations.map((o) => o.id),
      intent,
      context,
      status: 'open',
    };
  }

  shouldCloseEpisode(
    lastObservation: ObservationEvent,
    newObservation: ObservationEvent
  ): boolean {
    // Time gap check
    const lastTime = new Date(lastObservation.timestamp).getTime();
    const newTime = new Date(newObservation.timestamp).getTime();

    if (newTime - lastTime > this.episodeTimeout) {
      return true;
    }

    // App switch to unrelated app
    const lastApp = lastObservation.source.app_bundle_id;
    const newApp = newObservation.source.app_bundle_id;

    if (lastApp !== newApp) {
      const isUnrelatedSwitch =
        UNRELATED_APPS.includes(newApp) ||
        !this.appsRelated(lastApp, newApp);

      if (isUnrelatedSwitch) {
        return true;
      }
    }

    return false;
  }

  private detectIntent(observations: ObservationEvent[]): string {
    const urls = observations
      .map((o) => o.source.url)
      .filter(Boolean)
      .join(' ');

    const titles = observations
      .map((o) => o.source.window_title)
      .join(' ');

    const combined = `${urls} ${titles}`;

    for (const { pattern, intent } of INTENT_PATTERNS) {
      if (pattern.test(combined)) {
        return intent;
      }
    }

    return 'general_activity';
  }

  private extractContext(observations: ObservationEvent[]): Record<string, unknown> {
    const context: Record<string, unknown> = {
      apps: [...new Set(observations.map((o) => o.source.app_name))],
      urls: [...new Set(observations.map((o) => o.source.url).filter(Boolean))],
      duration_ms: this.calculateDuration(observations),
    };

    // Extract DOM excerpts for email context
    const excerpts = observations
      .map((o) => o.payload.dom_excerpt)
      .filter(Boolean);

    if (excerpts.length > 0) {
      context.content_preview = excerpts.join('\n').substring(0, 500);
    }

    return context;
  }

  private calculateDuration(observations: ObservationEvent[]): number {
    if (observations.length < 2) return 0;

    const first = new Date(observations[0].timestamp).getTime();
    const last = new Date(observations[observations.length - 1].timestamp).getTime();

    return last - first;
  }

  private appsRelated(app1: string, app2: string): boolean {
    // Browser-to-browser is related
    const browsers = ['com.google.Chrome', 'com.apple.Safari', 'org.mozilla.firefox'];
    if (browsers.includes(app1) && browsers.includes(app2)) {
      return true;
    }

    // Same vendor is related
    const vendor1 = app1.split('.').slice(0, 2).join('.');
    const vendor2 = app2.split('.').slice(0, 2).join('.');

    return vendor1 === vendor2;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/electron/ops/agents/interpreter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/ops/agents/interpreter.ts test/unit/electron/ops/agents/
git commit -m "feat(ops): add Interpreter Agent for task episode detection"
```

---

### Task 12: Drafting Agent

**Files:**
- Create: `electron/ops/agents/drafter.ts`

**Step 1: Create Drafting Agent**

Create `electron/ops/agents/drafter.ts`:

```typescript
import type { TaskEpisode, ProposedAction } from '../../src/types/ops';
import { v7 as uuidv7 } from 'uuid';

interface DraftTemplate {
  intent: string;
  actionType: ProposedAction['action_type'];
  generateDraft: (episode: TaskEpisode) => Partial<ProposedAction>;
}

const TEMPLATES: DraftTemplate[] = [
  {
    intent: 'email_interaction',
    actionType: 'email_draft',
    generateDraft: (episode) => ({
      title: 'Reply to email',
      summary: `Draft reply based on: ${episode.context.content_preview || 'email content'}`,
      draft_content: generateEmailReply(episode),
    }),
  },
  {
    intent: 'calendar_interaction',
    actionType: 'calendar_event',
    generateDraft: (episode) => ({
      title: 'Schedule meeting',
      summary: 'Create calendar event',
      draft_content: JSON.stringify({
        summary: 'New Meeting',
        duration: 30,
      }),
    }),
  },
  {
    intent: 'notion_interaction',
    actionType: 'notion_page',
    generateDraft: (episode) => ({
      title: 'Create note',
      summary: 'Create new Notion page',
      draft_content: '',
    }),
  },
];

function generateEmailReply(episode: TaskEpisode): string {
  // Simple template - in production, this would call an LLM
  const preview = episode.context.content_preview as string || '';

  return `Hi,

Thank you for your email.

[Draft reply to: "${preview.substring(0, 100)}..."]

Best regards`;
}

export class DraftingAgent {
  async createDraft(episode: TaskEpisode): Promise<ProposedAction | null> {
    const template = TEMPLATES.find((t) => t.intent === episode.intent);

    if (!template) {
      return null;
    }

    const draftFields = template.generateDraft(episode);

    return {
      id: uuidv7(),
      created_at: new Date().toISOString(),
      episode_id: episode.id,
      action_type: template.actionType,
      title: draftFields.title || 'Untitled',
      summary: draftFields.summary || '',
      draft_content: draftFields.draft_content || '',
      confidence: this.calculateConfidence(episode),
      risk_level: this.assessRisk(template.actionType),
      status: 'pending',
      metadata: {
        episode_context: episode.context,
      },
    };
  }

  private calculateConfidence(episode: TaskEpisode): number {
    let confidence = 50;

    // More observations = higher confidence
    confidence += Math.min(episode.observation_ids.length * 5, 20);

    // Content preview = higher confidence
    if (episode.context.content_preview) {
      confidence += 15;
    }

    // Longer duration = higher confidence (more deliberate action)
    const duration = episode.context.duration_ms as number || 0;
    if (duration > 10000) confidence += 10;

    return Math.min(confidence, 95);
  }

  private assessRisk(actionType: ProposedAction['action_type']): 'low' | 'medium' | 'high' {
    switch (actionType) {
      case 'email_draft':
        return 'low'; // Draft only, not sent
      case 'calendar_event':
        return 'medium'; // Sends invites
      case 'notion_page':
        return 'low';
      default:
        return 'medium';
    }
  }
}
```

**Step 2: Commit**

```bash
git add electron/ops/agents/drafter.ts
git commit -m "feat(ops): add Drafting Agent for proposal generation"
```

---

### Task 13: Policy Agent

**Files:**
- Create: `electron/ops/agents/policy.ts`
- Test: `test/unit/electron/ops/agents/policy.test.ts`

**Step 1: Write the failing test**

Create `test/unit/electron/ops/agents/policy.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PolicyAgent } from '../../../../electron/ops/agents/policy';
import type { ProposedAction } from '../../../../src/types/ops';

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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/unit/electron/ops/agents/policy.test.ts`
Expected: FAIL

**Step 3: Implement PolicyAgent**

Create `electron/ops/agents/policy.ts`:

```typescript
import type { ProposedAction } from '../../src/types/ops';

export type PolicyDecision = {
  action: 'auto_decline' | 'require_approval' | 'one_click_approve' | 'eligible_shadow' | 'eligible_autopilot';
  reason: string;
  warnings: string[];
};

export class PolicyAgent {
  private thresholds = {
    autoDecline: 30,
    requireApproval: 60,
    oneClick: 80,
    shadow: 85,
    autopilot: 90,
  };

  evaluate(proposal: ProposedAction): PolicyDecision {
    const warnings: string[] = [];

    // Check confidence thresholds
    if (proposal.confidence < this.thresholds.autoDecline) {
      return {
        action: 'auto_decline',
        reason: `Low confidence (${proposal.confidence}%) - below ${this.thresholds.autoDecline}% threshold`,
        warnings: [],
      };
    }

    // Add warnings for risk factors
    if (proposal.risk_level === 'high') {
      warnings.push('High risk action - review carefully');
    }

    if (!proposal.draft_content || proposal.draft_content.length < 10) {
      warnings.push('Draft content is empty or very short');
    }

    // Determine action based on confidence + risk
    if (proposal.confidence >= this.thresholds.autopilot && proposal.risk_level === 'low') {
      return {
        action: 'eligible_autopilot',
        reason: `Very high confidence (${proposal.confidence}%) with low risk`,
        warnings,
      };
    }

    if (proposal.confidence >= this.thresholds.shadow && proposal.risk_level !== 'high') {
      return {
        action: 'eligible_shadow',
        reason: `High confidence (${proposal.confidence}%) - eligible for shadow mode`,
        warnings,
      };
    }

    if (proposal.confidence >= this.thresholds.oneClick && proposal.risk_level === 'low') {
      return {
        action: 'one_click_approve',
        reason: `High confidence (${proposal.confidence}%) with low risk`,
        warnings,
      };
    }

    return {
      action: 'require_approval',
      reason: `Medium confidence (${proposal.confidence}%) - requires explicit approval`,
      warnings,
    };
  }

  adjustConfidence(
    proposal: ProposedAction,
    historicalAccuracy: number,
    recentEditDistance: number
  ): number {
    let adjusted = proposal.confidence;

    // Boost if historically accurate
    if (historicalAccuracy > 0.8) {
      adjusted += 10;
    } else if (historicalAccuracy < 0.5) {
      adjusted -= 15;
    }

    // Penalize if recent edits were heavy
    if (recentEditDistance > 0.3) {
      adjusted -= 10;
    }

    return Math.max(0, Math.min(100, adjusted));
  }

  isAutopilotAllowed(
    proposal: ProposedAction,
    playbookMode: string,
    dailyExecutions: number,
    maxDaily: number
  ): boolean {
    if (playbookMode !== 'autopilot') return false;
    if (dailyExecutions >= maxDaily) return false;
    if (proposal.risk_level === 'high') return false;
    if (proposal.confidence < this.thresholds.autopilot) return false;

    return true;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/unit/electron/ops/agents/policy.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/ops/agents/policy.ts test/unit/electron/ops/agents/policy.test.ts
git commit -m "feat(ops): add Policy Agent for confidence thresholds and risk assessment"
```

---

### Task 14: Playbook Miner

**Files:**
- Create: `electron/ops/agents/playbook-miner.ts`

**Step 1: Create Playbook Miner**

Create `electron/ops/agents/playbook-miner.ts`:

```typescript
import { v7 as uuidv7 } from 'uuid';
import type { TaskEpisode, Playbook, DecisionLog } from '../../src/types/ops';

interface PatternCandidate {
  intent: string;
  appPattern: string;
  urlPattern?: string;
  occurrences: number;
  avgEditDistance: number;
  successRate: number;
  firstSeen: string;
  lastSeen: string;
}

export class PlaybookMiner {
  private minOccurrences = 5;
  private maxEditDistance = 0.15;
  private minDaysSpan = 3;
  private minSuccessRate = 0.9;

  analyzePatterns(
    episodes: TaskEpisode[],
    decisions: DecisionLog[]
  ): PatternCandidate[] {
    const patterns = new Map<string, PatternCandidate>();

    for (const episode of episodes) {
      const key = this.getPatternKey(episode);

      if (!patterns.has(key)) {
        patterns.set(key, {
          intent: episode.intent,
          appPattern: this.extractAppPattern(episode),
          urlPattern: this.extractUrlPattern(episode),
          occurrences: 0,
          avgEditDistance: 0,
          successRate: 1,
          firstSeen: episode.created_at,
          lastSeen: episode.created_at,
        });
      }

      const pattern = patterns.get(key)!;
      pattern.occurrences++;
      pattern.lastSeen = episode.updated_at;

      // Calculate edit distance from decisions
      const relatedDecisions = decisions.filter((d) =>
        episodes.some((e) => e.id === d.proposal_id)
      );

      if (relatedDecisions.length > 0) {
        const avgEdit = relatedDecisions
          .map((d) => d.edit_distance || 0)
          .reduce((a, b) => a + b, 0) / relatedDecisions.length;
        pattern.avgEditDistance = avgEdit;

        const successes = relatedDecisions.filter((d) => d.execution_result === 'success').length;
        pattern.successRate = successes / relatedDecisions.length;
      }
    }

    return Array.from(patterns.values());
  }

  suggestPlaybook(candidate: PatternCandidate): Playbook | null {
    // Check thresholds
    if (candidate.occurrences < this.minOccurrences) return null;
    if (candidate.avgEditDistance > this.maxEditDistance) return null;
    if (candidate.successRate < this.minSuccessRate) return null;

    // Check time span
    const firstDate = new Date(candidate.firstSeen);
    const lastDate = new Date(candidate.lastSeen);
    const daysDiff = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff < this.minDaysSpan) return null;

    return {
      id: uuidv7(),
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      name: this.generatePlaybookName(candidate),
      description: `Auto-detected pattern: ${candidate.intent} with ${candidate.occurrences} occurrences`,
      trigger: {
        app_pattern: candidate.appPattern,
        url_pattern: candidate.urlPattern,
        context_signals: [],
      },
      actions: [],
      mode: 'suggest',
      max_daily_executions: 50,
      stats: {
        total_executions: 0,
        successful_executions: 0,
        avg_edit_distance: candidate.avgEditDistance,
        dry_runs_completed: 0,
      },
    };
  }

  private getPatternKey(episode: TaskEpisode): string {
    const apps = (episode.context.apps as string[]) || [];
    const urls = (episode.context.urls as string[]) || [];

    return `${episode.intent}:${apps.sort().join(',')}:${urls.map((u) => new URL(u).hostname).sort().join(',')}`;
  }

  private extractAppPattern(episode: TaskEpisode): string {
    const apps = (episode.context.apps as string[]) || [];
    if (apps.length === 0) return '.*';

    // Find common prefix
    const bundleIds = apps.map((a) => a.toLowerCase());
    return bundleIds[0].replace(/\./g, '\\.');
  }

  private extractUrlPattern(episode: TaskEpisode): string | undefined {
    const urls = (episode.context.urls as string[]) || [];
    if (urls.length === 0) return undefined;

    try {
      const hostnames = urls.map((u) => new URL(u).hostname);
      const common = hostnames[0];
      return common.replace(/\./g, '\\.');
    } catch {
      return undefined;
    }
  }

  private generatePlaybookName(candidate: PatternCandidate): string {
    const intentName = candidate.intent.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return `Auto: ${intentName}`;
  }
}
```

**Step 2: Commit**

```bash
git add electron/ops/agents/playbook-miner.ts
git commit -m "feat(ops): add Playbook Miner for automation pattern detection"
```

---

### Task 15: Debugging Tools (Timeline, Explain, Replay)

**Files:**
- Create: `src/components/OpsInbox/DebugPanel.tsx`
- Create: `electron/ops/debug/timeline.ts`

**Step 1: Create Timeline service**

Create `electron/ops/debug/timeline.ts`:

```typescript
import type { ObservationEvent, TaskEpisode, ProposedAction, DecisionLog } from '../../src/types/ops';

export interface TimelineEntry {
  timestamp: string;
  type: 'observation' | 'episode' | 'proposal' | 'decision' | 'execution';
  summary: string;
  details: Record<string, unknown>;
}

export interface ExplainResult {
  triggered: boolean;
  conditions: {
    name: string;
    matched: boolean;
    expected: string;
    actual: string;
  }[];
  suggestion?: string;
}

export class DebugTimeline {
  buildTimeline(
    observations: ObservationEvent[],
    episodes: TaskEpisode[],
    proposals: ProposedAction[],
    decisions: DecisionLog[]
  ): TimelineEntry[] {
    const entries: TimelineEntry[] = [];

    // Add observations
    for (const obs of observations) {
      entries.push({
        timestamp: obs.timestamp,
        type: 'observation',
        summary: `${obs.event_type}: ${obs.source.app_name} - ${obs.source.window_title}`,
        details: {
          id: obs.id,
          session_id: obs.session_id,
          source: obs.source,
          payload: obs.payload,
        },
      });
    }

    // Add episodes
    for (const ep of episodes) {
      entries.push({
        timestamp: ep.created_at,
        type: 'episode',
        summary: `TaskEpisode: "${ep.intent}"`,
        details: {
          id: ep.id,
          observation_count: ep.observation_ids.length,
          context: ep.context,
          status: ep.status,
        },
      });
    }

    // Add proposals
    for (const prop of proposals) {
      entries.push({
        timestamp: prop.created_at,
        type: 'proposal',
        summary: `Proposal: ${prop.title} (${prop.confidence}%)`,
        details: {
          id: prop.id,
          action_type: prop.action_type,
          confidence: prop.confidence,
          risk_level: prop.risk_level,
          status: prop.status,
        },
      });
    }

    // Add decisions
    for (const dec of decisions) {
      entries.push({
        timestamp: dec.timestamp,
        type: 'decision',
        summary: `Decision: ${dec.decision}${dec.execution_result ? ` → ${dec.execution_result}` : ''}`,
        details: {
          id: dec.id,
          proposal_id: dec.proposal_id,
          edit_distance: dec.edit_distance,
          error_message: dec.error_message,
        },
      });
    }

    // Sort by timestamp
    return entries.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  explainPlaybook(
    playbook: { trigger: { app_pattern: string; url_pattern?: string; context_signals: string[] } },
    observation: ObservationEvent
  ): ExplainResult {
    const conditions: ExplainResult['conditions'] = [];
    let allMatched = true;

    // Check app pattern
    const appMatches = new RegExp(playbook.trigger.app_pattern, 'i')
      .test(observation.source.app_bundle_id);
    conditions.push({
      name: 'App Pattern',
      matched: appMatches,
      expected: playbook.trigger.app_pattern,
      actual: observation.source.app_bundle_id,
    });
    if (!appMatches) allMatched = false;

    // Check URL pattern
    if (playbook.trigger.url_pattern && observation.source.url) {
      const urlMatches = new RegExp(playbook.trigger.url_pattern, 'i')
        .test(observation.source.url);
      conditions.push({
        name: 'URL Pattern',
        matched: urlMatches,
        expected: playbook.trigger.url_pattern,
        actual: observation.source.url,
      });
      if (!urlMatches) allMatched = false;
    }

    // Generate suggestion
    let suggestion: string | undefined;
    if (!allMatched) {
      const failedCondition = conditions.find((c) => !c.matched);
      if (failedCondition) {
        suggestion = `Update ${failedCondition.name.toLowerCase()} to include "${failedCondition.actual}"`;
      }
    }

    return {
      triggered: allMatched,
      conditions,
      suggestion,
    };
  }
}
```

**Step 2: Create Debug Panel UI**

Create `src/components/OpsInbox/DebugPanel.tsx`:

```typescript
import { useState } from 'react';
import { Bug, Clock, HelpCircle, Play, GitCompare } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface TimelineEntry {
  timestamp: string;
  type: 'observation' | 'episode' | 'proposal' | 'decision' | 'execution';
  summary: string;
  details: Record<string, unknown>;
}

interface DebugPanelProps {
  timeline: TimelineEntry[];
  onReplay?: (entries: TimelineEntry[]) => void;
}

const typeColors = {
  observation: 'bg-blue-100 text-blue-800',
  episode: 'bg-purple-100 text-purple-800',
  proposal: 'bg-green-100 text-green-800',
  decision: 'bg-yellow-100 text-yellow-800',
  execution: 'bg-red-100 text-red-800',
};

export function DebugPanel({ timeline, onReplay }: DebugPanelProps) {
  const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b">
        <Bug className="h-5 w-5" />
        <h3 className="font-semibold">Debug Tools</h3>
      </div>

      <Tabs defaultValue="timeline" className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-2">
          <TabsTrigger value="timeline" className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="explain" className="flex items-center gap-1">
            <HelpCircle className="h-4 w-4" />
            Explain
          </TabsTrigger>
          <TabsTrigger value="replay" className="flex items-center gap-1">
            <Play className="h-4 w-4" />
            Replay
          </TabsTrigger>
          <TabsTrigger value="diff" className="flex items-center gap-1">
            <GitCompare className="h-4 w-4" />
            Diff
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="flex-1 mt-0">
          <ScrollArea className="h-full p-4">
            <div className="space-y-2">
              {timeline.map((entry, index) => (
                <Card
                  key={index}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedEntry(entry)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={typeColors[entry.type]} variant="secondary">
                            {entry.type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm">{entry.summary}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="explain" className="flex-1 mt-0 p-4">
          <div className="text-center text-muted-foreground py-8">
            Select a playbook and observation to explain why it did or didn't trigger.
          </div>
        </TabsContent>

        <TabsContent value="replay" className="flex-1 mt-0 p-4">
          <div className="text-center text-muted-foreground py-8">
            Select a time range to replay observations and test playbook changes.
          </div>
        </TabsContent>

        <TabsContent value="diff" className="flex-1 mt-0 p-4">
          <div className="text-center text-muted-foreground py-8">
            Compare playbook behavior across different time periods.
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail panel */}
      {selectedEntry && (
        <div className="border-t p-4">
          <h4 className="font-medium mb-2">Details</h4>
          <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
            {JSON.stringify(selectedEntry.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add electron/ops/debug/ src/components/OpsInbox/DebugPanel.tsx
git commit -m "feat(ops): add debugging tools with timeline, explain, replay views"
```

---

## Final Integration

### Task 16: Wire Everything Together

**Files:**
- Modify: `electron/main/index.ts`
- Modify: `src/App.tsx`
- Create: `electron/ops/index.ts`

**Step 1: Create Ops Layer main entry point**

Create `electron/ops/index.ts`:

```typescript
import { ipcMain, app } from 'electron';
import * as path from 'path';
import { OpsDatabase } from './database';
import { OpsTray } from './tray';
import { ComputerMcpServer } from './mcp-server';
import { InterpreterAgent } from './agents/interpreter';
import { DraftingAgent } from './agents/drafter';
import { PolicyAgent } from './agents/policy';
import { PlaybookMiner } from './agents/playbook-miner';
import type { ObservationEvent } from '../src/types/ops';

export class OpsLayer {
  private db: OpsDatabase;
  private tray: OpsTray | null = null;
  private mcpServer: ComputerMcpServer;
  private interpreter: InterpreterAgent;
  private drafter: DraftingAgent;
  private policy: PolicyAgent;
  private miner: PlaybookMiner;
  private observationBuffer: ObservationEvent[] = [];

  constructor(private onOpenOpsInbox: () => void) {
    const dbPath = path.join(app.getPath('userData'), 'ops.db');
    this.db = new OpsDatabase(dbPath);

    this.mcpServer = new ComputerMcpServer();
    this.interpreter = new InterpreterAgent();
    this.drafter = new DraftingAgent();
    this.policy = new PolicyAgent();
    this.miner = new PlaybookMiner();

    this.setupEventHandlers();
    this.setupIpc();
  }

  init(): void {
    this.tray = new OpsTray(this.onOpenOpsInbox);
    this.tray.init();
  }

  private setupEventHandlers(): void {
    this.mcpServer.onEvent(async (event) => {
      // Store observation
      this.db.insertObservation({
        id: event.id,
        timestamp: event.timestamp,
        session_id: event.session_id,
        source: JSON.stringify(event.source),
        event_type: event.event_type,
        payload: JSON.stringify(event.payload),
        redaction_applied: JSON.stringify(event.redaction_applied),
        confidence: event.confidence,
      });

      // Buffer for episode detection
      this.observationBuffer.push(event);

      // Check for episode boundary
      if (this.observationBuffer.length >= 2) {
        const last = this.observationBuffer[this.observationBuffer.length - 2];
        const current = event;

        if (this.interpreter.shouldCloseEpisode(last, current)) {
          await this.processEpisode();
        }
      }
    });
  }

  private async processEpisode(): Promise<void> {
    if (this.observationBuffer.length === 0) return;

    // Create episode
    const episode = this.interpreter.interpret(this.observationBuffer);
    if (!episode) return;

    // Generate draft
    const proposal = await this.drafter.createDraft(episode);
    if (!proposal) return;

    // Evaluate policy
    const decision = this.policy.evaluate(proposal);

    if (decision.action === 'auto_decline') {
      // Log but don't show
      return;
    }

    // Store proposal
    this.db.insertProposal({
      id: proposal.id,
      created_at: proposal.created_at,
      episode_id: proposal.episode_id,
      action_type: proposal.action_type,
      title: proposal.title,
      summary: proposal.summary,
      draft_content: proposal.draft_content,
      confidence: proposal.confidence,
      risk_level: proposal.risk_level,
      status: proposal.status,
      metadata: JSON.stringify(proposal.metadata),
    });

    // Update tray count
    const pendingCount = this.db.getPendingProposals().length;
    this.tray?.updatePendingCount(pendingCount);

    // Show notification
    if (proposal.confidence >= 60) {
      this.tray?.showProposalNotification(
        proposal.title,
        proposal.summary,
        proposal.id
      );
    }

    // Clear buffer
    this.observationBuffer = [];
  }

  private setupIpc(): void {
    ipcMain.handle('ops:get-proposals', () => {
      return this.db.getPendingProposals().map((p) => ({
        ...p,
        metadata: JSON.parse(p.metadata),
      }));
    });

    ipcMain.handle('ops:approve-proposal', (_, id: string) => {
      this.db.updateProposalStatus(id, 'approved');
      const count = this.db.getPendingProposals().length;
      this.tray?.updatePendingCount(count);
      return true;
    });

    ipcMain.handle('ops:decline-proposal', (_, id: string) => {
      this.db.updateProposalStatus(id, 'declined');
      const count = this.db.getPendingProposals().length;
      this.tray?.updatePendingCount(count);
      return true;
    });

    ipcMain.handle('ops:get-playbooks', () => {
      return this.db.getAllPlaybooks().map((p) => ({
        ...p,
        trigger: JSON.parse(p.trigger),
        actions: JSON.parse(p.actions),
        stats: JSON.parse(p.stats),
      }));
    });

    ipcMain.handle('ops:start-observation', () => {
      this.mcpServer.start();
      return true;
    });

    ipcMain.handle('ops:stop-observation', () => {
      // MCP server stop handled internally
      return true;
    });
  }

  destroy(): void {
    this.tray?.destroy();
    this.db.close();
  }
}
```

**Step 2: Integrate into electron main**

Add to `electron/main/index.ts`:

```typescript
import { OpsLayer } from '../ops';

let opsLayer: OpsLayer | null = null;

// In app.whenReady() after mainWindow creation:
opsLayer = new OpsLayer(() => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.webContents.send('show-ops-inbox');
  }
});
opsLayer.init();

// In app.on('before-quit'):
opsLayer?.destroy();
```

**Step 3: Commit**

```bash
git add electron/ops/index.ts electron/main/index.ts
git commit -m "feat(ops): wire all components together in OpsLayer"
```

---

## Summary

This plan implements the Eigent Ops Layer MVP in 16 tasks across 3 phases:

**Phase 1: Foundation (Tasks 1-6)**
- Dependencies and types
- Local SQLite database
- Zustand store
- OpsInbox UI components
- System tray and notifications
- Computer MCP Server for observation

**Phase 2: Core Integrations (Tasks 7-10)**
- Gmail integration
- Google Calendar integration
- Notion integration
- Google Drive sync

**Phase 3: Intelligence (Tasks 11-16)**
- Interpreter Agent
- Drafting Agent
- Policy Agent
- Playbook Miner
- Debug tools
- Final integration

---

Plan complete and saved to `docs/plans/2026-01-17-ops-layer-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
