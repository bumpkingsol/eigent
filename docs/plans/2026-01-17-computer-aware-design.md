# Eigent Ops Layer (Computer-Aware Automation) – Design Document

**Date:** 2026-01-17
**Status:** Draft (Validated)
**Owner:** Jonas
**Scope:** Mac-first, MCP-based, high-context automation layer embedded into Eigent
**Usage:** Personal tool (single user, not a product)

---

## 1. Purpose

This document specifies the design for an Ops Layer inside Eigent that observes user activity on macOS, infers tasks, drafts or executes actions using tools (API-first), and gradually automates repetitive work via explicit human approval.

The system is designed to:

- Reduce cognitive load by automating boring, repetitive tasks
- Learn directly from real user behavior (not abstract prompts)
- Maintain safety, auditability, and user control at all times
- Progressively move from suggestion → shadow → approval → narrow autopilot

The core user experience is an **Ops Inbox** embedded in Eigent, where all proposed actions, drafts, and automation suggestions are reviewed and approved.

---

## 2. Goals & Non-Goals

### Goals

- Observe high-context user behavior locally on macOS
- Convert raw signals into structured task understanding
- Draft outputs (emails, docs, records, actions) for approval
- Support gradual automation with strict guardrails
- Use APIs as the primary execution mechanism
- Maintain full auditability from observation → execution

### Non-Goals (v1)

- Covert monitoring or surveillance
- Fully autonomous, unsupervised execution
- UI automation as the primary execution method
- Cross-device or multi-user monitoring
- Dev tool automation (handled by Claude Code)
- Mobile approval UI (proposals queue until at Mac)

---

## 3. High-Level Architecture

The system consists of four cooperating subsystems:

### 3.1 Computer MCP Server (Local, macOS)

A standalone local daemon that exposes observation and action tools via MCP.

**Responsibilities:**

- Emit high-context observation signals:
  - Active app/window
  - Chrome DOM snapshots
  - Accessibility tree
  - Optional on-device screenshots (redacted)
- Provide structured context from APIs (Gmail, Drive, Notion, Supabase)
- Expose action tools (draft, create, update, send)
- Enforce safety:
  - Sensitive-app blacklist
  - Field-level redaction
  - Global pause / private mode

This service runs independently of the Eigent Electron app.

#### 3.1.1 MCP Authentication Model

The Computer MCP Server uses a **local trust boundary** with the following security layers:

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **Transport** | Unix domain socket (`/tmp/eigent-mcp.sock`) | Prevents remote access; only local processes can connect |
| **Process Verification** | Client must provide PID; server verifies via `proc_pidpath()` | Only whitelisted executables (Eigent.app) can connect |
| **Session Token** | HMAC-SHA256 token generated on first connection, stored in macOS Keychain | Prevents token replay; rotates on Eigent restart |
| **Capability Scoping** | Per-connection capability grants (observe, draft, execute) | Principle of least privilege |

**Connection Flow:**
```
1. Eigent launches → checks if MCP server running
2. If not running → spawns MCP server as launchd agent
3. Eigent connects to Unix socket → sends PID + session request
4. MCP server verifies PID → returns session token + granted capabilities
5. All subsequent calls require valid session token
```

**Revocation:**
- Eigent quit → session invalidated
- User triggers "Revoke MCP Access" → all sessions invalidated, token rotated
- MCP server restart → all sessions invalidated

### 3.2 Eigent (Agent Orchestration + UI)

Eigent acts as:

- **Agent Orchestrator** – runs workers and workflows
- **Control Plane UI** – hosts the Ops Inbox and approvals

Eigent communicates with the Computer MCP Server exclusively through MCP tools.

#### 3.2.1 State Synchronization

When multiple Eigent windows are open:

- **Ops Inbox state** is stored in a local SQLite DB (`~/.eigent/ops.db`)
- All windows subscribe to DB changes via `better-sqlite3` triggers
- Approval in one window immediately reflects in others
- Conflict resolution: last-write-wins for approvals; merges for edits

### 3.3 Ops Inbox (Embedded UI)

A first-class Eigent panel that surfaces:

- Proposed actions and drafts
- Automation suggestions
- Confidence and risk indicators
- Approval, edit, decline, shadow, autopilot toggles
- Execution logs and audit trail

This is the **single choke point** for all execution.

### 3.4 Execution Layer

**Execution priority:**

1. Official APIs (Gmail, Drive, Notion, Supabase)
2. Browser automation (Playwright) via MCP
3. macOS Accessibility automation (last resort)

No execution occurs without passing through policy checks and, unless autopilot is explicitly enabled, human approval.

#### 3.4.1 Execution Resilience

| Failure Mode | Handling |
|--------------|----------|
| API auth expired | Pause execution → surface re-auth prompt in Ops Inbox → resume on success |
| API rate limit | Exponential backoff (max 5 retries) → surface to user if exhausted |
| Browser DOM changed | Retry with fresh selector → fallback to accessibility → fail gracefully |
| Network offline | Queue action locally → execute when connectivity restored (max 24h TTL) |

---

## 4. Agent Roles

### Interpreter Agent

- Converts raw observations into structured TaskEpisodes
- Determines intent, inputs, expected outcome
- No drafting or execution responsibilities

**Episode Boundary Detection:**
- **Time gap:** >5 minutes of inactivity starts new episode
- **App switch:** Switching to unrelated app closes current episode
- **Explicit signal:** User clicking "New Task" or similar
- **Interleaved tasks:** Maintain parallel episodes per app context; merge if same intent detected

### Drafting Agent

- Produces drafts (emails, docs, records)
- Uses GPT/Nano Banana as needed
- Drafts are explicitly non-final

### Policy & Risk Agent

- Assigns confidence score (0-100)
- Labels risk category
- Determines approval requirements
- Enforces permission model

#### 4.1 Confidence Score Model

| Score Range | Label | Behavior |
|-------------|-------|----------|
| **0-29** | Low | Auto-decline; log for training only |
| **30-59** | Medium | Require explicit approval; highlight uncertainties |
| **60-79** | High | Default to approval prompt; allow one-click approve |
| **80-89** | Very High | Eligible for shadow mode promotion |
| **90-100** | Near-Certain | Eligible for autopilot (if explicitly enabled) |

**Score Composition:**
```
confidence = (
    0.3 × intent_clarity +      # How clear is the user's goal?
    0.2 × context_completeness + # Do we have all needed info?
    0.2 × historical_accuracy +  # How often were similar drafts accepted?
    0.2 × action_reversibility + # Can we undo if wrong?
    0.1 × recency_weight         # More recent patterns weighted higher
)
```

### Playbook Miner Agent

- Detects repeated stable TaskEpisodes
- Proposes automation playbooks
- Never enables autopilot directly

#### 4.2 Playbook Detection Criteria

| Criterion | Threshold | Rationale |
|-----------|-----------|-----------|
| **Minimum repetitions** | ≥5 occurrences | Avoid overfitting to coincidence |
| **Edit distance** | ≤15% average edits | User accepts drafts largely unchanged |
| **Time span** | Occurrences spread over ≥3 days | Not a one-time burst |
| **Outcome consistency** | ≥90% successful execution | Pattern produces reliable results |

**User Controls:**
- Users can inspect detected patterns before they become playbooks
- Users can edit playbook triggers and actions
- Users can delete playbooks at any time
- Playbooks have version history (last 10 versions retained)

### Runner Agent

- Executes approved actions
- Chooses execution path (API → browser → desktop)
- Verifies outcome and emits ExecutionResult

#### 4.3 Dry Run Mode

Before enabling autopilot on any playbook:

1. **Dry Run Required:** Playbook must complete 3 successful dry runs
2. **Dry Run Behavior:**
   - Full execution pipeline runs
   - All API calls are simulated (read-only where possible)
   - "Would execute" result shown to user
   - No side effects committed
3. **Dry Run Diff:** Show expected vs actual outcome comparison
4. **User Confirmation:** After 3 dry runs, user must explicitly confirm "Enable Autopilot"

---

## 5. Core Artifacts

All work is represented using typed artifacts:

### 5.1 ObservationEvent Schema

```typescript
interface ObservationEvent {
  id: string;                    // UUID v7 (time-sortable)
  timestamp: string;             // ISO 8601 with milliseconds
  session_id: string;            // Groups related events

  // Source identification
  source: {
    app_bundle_id: string;       // e.g., "com.google.Chrome"
    app_name: string;            // e.g., "Google Chrome"
    window_title: string;        // Current window title
    window_id: number;           // macOS window ID
    url?: string;                // For browsers, current URL (redacted if sensitive)
  };

  // Event type and payload
  event_type:
    | "app_activated"
    | "window_focused"
    | "url_changed"
    | "dom_snapshot"
    | "text_input"
    | "click"
    | "scroll"
    | "file_opened"
    | "clipboard_copy";

  payload: {
    dom_hash?: string;           // SHA256 of DOM structure (not content)
    dom_excerpt?: string;        // Relevant DOM text (max 2KB, redacted)
    input_field_id?: string;     // Which field received input
    input_length?: number;       // Character count (not content)
    click_target?: string;       // CSS selector of clicked element
    file_path?: string;          // For file events (redacted if in sensitive dir)
  };

  // Privacy controls
  redaction_applied: string[];   // List of redaction rules that fired
  confidence: number;            // 0-1, how complete is this observation?
}
```

### 5.2 Other Artifacts

- **TaskEpisode** – Interpreted user intent from observation sequence
- **Draft** – Proposed content (email, document, record)
- **ProposedAction** – Action awaiting approval in Ops Inbox
- **AutomationSuggestion** – Candidate for playbook promotion
- **Playbook** – Approved automation rule with trigger and actions
- **ExecutionResult** – Outcome of an executed action
- **DecisionLog** – Audit record linking observation → decision → execution

All artifacts are persisted (Supabase or local DB) and visible in the Ops Inbox.

### 5.3 Playbook Schema

```typescript
interface Playbook {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;

  // Identification
  name: string;                  // User-editable name
  description: string;           // Auto-generated, user-editable

  // Trigger conditions
  trigger: {
    app_pattern: string;         // Regex for app bundle ID
    url_pattern?: string;        // Regex for URL (browsers)
    context_signals: string[];   // Required context elements
    time_constraints?: {
      days_of_week?: number[];   // 0=Sunday
      hours?: [number, number];  // Start, end hour (24h)
    };
  };

  // Actions
  actions: PlaybookAction[];

  // Automation level
  mode: "suggest" | "shadow" | "approve" | "autopilot";

  // Safety
  max_daily_executions: number;  // Cap for autopilot mode
  requires_verification: boolean;
  rollback_action?: PlaybookAction;

  // Stats
  stats: {
    total_executions: number;
    successful_executions: number;
    avg_edit_distance: number;
    last_execution: string;
    dry_runs_completed: number;
  };
}
```

---

## 6. Data Flow & Lifecycle

### Observation

- MCP emits high-context signals
- Events grouped into Sessions

### Understanding

- Interpreter Agent creates TaskEpisode

### Drafting

- Drafting Agent generates Draft(s)

### Policy Evaluation

- Policy Agent annotates confidence, risk, permissions

### Proposal

- ProposedAction appears in Ops Inbox

### Human Decision

- Approve / Edit / Decline / Shadow / Automate

### Execution

- Runner Agent executes via approved tools
- Verification performed

### Learning

- Decisions feed Playbook Miner
- Automation suggestions promoted gradually

---

## 7. Automation Promotion Model

Each workflow progresses through:

1. **Observe-only** – System watches, no proposals
2. **Suggest drafts** – Proposals appear in Inbox
3. **Shadow mode** – Parallel execution (non-committing), compare to human
4. **Human-approved execution** – One-click approve
5. **Narrow autopilot** – Explicit, scoped, capped

### Promotion Requirements

| From → To | Requirements |
|-----------|--------------|
| Observe → Suggest | ≥3 similar episodes detected |
| Suggest → Shadow | ≥5 approvals with ≤15% edit distance |
| Shadow → Approve | ≥10 shadow runs with ≥95% match to human |
| Approve → Autopilot | User explicit opt-in + 3 dry runs + daily cap set |

### Demotion Triggers

- Edit distance increases above 30% → demote to Suggest
- Execution failure rate >10% → demote to Shadow
- User manually declines 3 consecutive → demote one level
- Any rollback triggered → demote to Approve, require review

---

## 8. Safety & Permissions

### Permission Model

- Per-tool, per-action permissions
- Autopilot requires explicit whitelisting
- Destructive actions disabled by default

### Redaction

- Passwords, payment fields, tokens removed before agents
- Screenshots blurred; DOM text preferred
- Sensitive directories excluded (`~/.ssh`, `~/.*credentials*`, etc.)

### Kill Switches

- **Global pause** – One-click stops all observation and execution
- **Per-playbook disable** – Disable specific automations
- **MCP access revocation** – Invalidate all sessions immediately
- **Private mode** – Temporarily suspend observation (hotkey: ⌘⇧P)

### Private Mode Behavior

When Private Mode is activated:
1. Current observation buffer is **discarded** (not persisted)
2. MCP server stops emitting events
3. Ops Inbox shows "Private Mode Active" banner
4. No new TaskEpisodes created
5. Existing pending proposals remain (user can still approve)
6. Deactivation resumes observation with fresh session

### Auditability

Every execution links to:

- Originating TaskEpisode
- Draft
- Decision (who approved, when, any edits)
- Execution logs
- Rollback status (if applicable)

---

## 9. Error Handling

### Observation Failures

- Partial context → low confidence → no proposal
- MCP server crash → Eigent shows "Observation Unavailable" → auto-reconnect

### Draft Errors

- Unverifiable claims flagged
- Required fields highlighted
- Confidence penalty applied

### Execution Failures

- Structured ExecutionResult with error details
- No silent retries
- Rollback surfaced when possible

### Rollback Support

| Action Type | Rollback Capability |
|-------------|---------------------|
| Email sent | ❌ No (Gmail doesn't support) |
| Email draft created | ✅ Delete draft |
| Calendar event created | ✅ Delete event |
| Notion page created | ✅ Archive page |
| Notion page updated | ✅ Restore previous version |
| File created | ✅ Move to trash |
| File modified | ✅ Restore from backup (if enabled) |
| API POST/PUT | ⚠️ Depends on API (store inverse operation if available) |

**The system always prefers inaction over unsafe action.**

---

## 10. Operational Considerations

### 10.1 Offline Mode

When Eigent is closed but Computer MCP Server is running:

| Scenario | Behavior |
|----------|----------|
| Eigent closed gracefully | MCP server continues observing; buffers to local ring buffer (max 1000 events, ~10MB) |
| Eigent reopens | Buffered events replayed to Interpreter Agent |
| Buffer full | Oldest events dropped (FIFO); warning logged |
| MCP server idle >1 hour | Enters low-power mode; observation frequency reduced |
| Eigent closed >24 hours | Buffer discarded on next Eigent launch (stale data) |

### 10.2 Rate Limiting

| Resource | Limit | Rationale |
|----------|-------|-----------|
| Observation events | 100/second | Prevent CPU spike during rapid interaction |
| DOM snapshots | 1/second per tab | DOM parsing is expensive |
| API calls (per service) | Respect service limits | Gmail: 250/day, Notion: 3/second |
| Playbook executions | User-configurable cap | Default: 50/day per playbook |
| Draft generation | 10/minute | Prevent LLM cost runaway |

### 10.3 Versioning & Schema Evolution

**Playbook Versioning:**
- Playbooks have monotonic version numbers
- Breaking changes to playbook schema require migration
- Old playbooks marked "needs review" after migration
- Users can rollback to previous playbook version

**API Schema Changes:**
- Each integrated service (Gmail, Notion, etc.) has a schema version
- Schema drift detection: weekly background check against live API
- If schema changed: affected playbooks paused, user notified
- Playbook stores "last known working schema version"

**Observation Event Versioning:**
- ObservationEvent schema includes `schema_version` field
- Interpreter Agent handles multiple schema versions
- Old events remain readable; new fields nullable

---

## 11. Testing & Evaluation

### Testing Layers

- Unit tests for MCP tools and agents
- Replay/simulation of recorded TaskEpisodes
- Shadow-mode comparison (AI vs human)
- Autopilot canaries with caps and digests
- Dry run validation for all playbooks

### Key Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Draft edit rate | <20% | Levenshtein distance of edits |
| False-positive proposals | <10% | Declined proposals / total |
| Time-to-approval | <5 seconds | Median time from proposal to decision |
| Autopilot rollback rate | <1% | Rollbacks / autopilot executions |
| Human touch frequency | Decreasing trend | Manual interventions per day |
| Observation coverage | >80% | TaskEpisodes with complete context |

---

## 12. Success Criteria

The system is successful when:

- Ops Inbox can be **skimmed, not read**
- ≥50% of boring tasks are draft+approve
- Low-risk workflows run autonomously without surprises
- Cognitive load is noticeably reduced
- Users trust the system enough to enable autopilot on ≥3 playbooks

---

## 13. Learning Feedback Loop

The system continuously improves through explicit and implicit feedback:

```
┌─────────────────────────────────────────────────────────────────┐
│                      FEEDBACK LOOP                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │ Observe  │───▶│  Draft   │───▶│ Propose  │───▶│ Decision │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│       ▲                                               │         │
│       │                                               ▼         │
│       │         ┌─────────────────────────────────────┐         │
│       │         │         LEARNING SIGNALS            │         │
│       │         ├─────────────────────────────────────┤         │
│       │         │ • Approval (positive signal)        │         │
│       │         │ • Edit (correction signal)          │         │
│       │         │ • Decline (negative signal)         │         │
│       │         │ • Edit content (training data)      │         │
│       │         │ • Time-to-decision (confidence)     │         │
│       │         │ • Execution success/failure         │         │
│       │         └─────────────────────────────────────┘         │
│       │                          │                              │
│       │                          ▼                              │
│       │         ┌─────────────────────────────────────┐         │
│       │         │         MODEL UPDATES               │         │
│       │         ├─────────────────────────────────────┤         │
│       │         │ • Adjust confidence weights         │         │
│       │         │ • Update intent classifiers         │         │
│       │         │ • Refine draft templates            │         │
│       │         │ • Tune episode boundary detection   │         │
│       │         │ • Improve playbook triggers         │         │
│       │         └─────────────────────────────────────┘         │
│       │                          │                              │
│       └──────────────────────────┘                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Feedback Storage

- All decisions stored with full context
- Edit diffs preserved for training
- Declined proposals analyzed for false-positive patterns
- Weekly aggregation into training datasets
- User can opt-out of contributing to model improvements

---

## 14. Next Steps

### Phase 1: Foundation
1. Define MCP schemas (observe, context, act)
2. Implement minimal Computer MCP Server
   - Unix socket transport
   - App/window observation
   - Chrome DOM integration
3. Add Ops Inbox panel + proposal/decision contract
4. Implement notification system (dock badge, menu bar widget, macOS notifications)

### Phase 2: Core Integrations
5. Ship Gmail draft/approve loop
6. Ship Google Calendar integration (scheduling, rescheduling, prep, triage)
7. Ship Notion draft/approve loop
8. Set up Google Drive sync for backup

### Phase 3: Intelligence
9. Instrument learning signals
10. Implement Playbook Miner
11. Add debugging tools (timeline, explain, replay, diff)

### Phase 4: Automation
12. Shadow mode + dry run
13. Autopilot (limited scope)

### Phase 5: Extensibility
14. MCP integration plugin system
15. Documentation for custom integrations

---

## Appendix A: Sensitive App Blacklist (Default)

The following apps are excluded from observation by default:

- `com.apple.keychainaccess` (Keychain Access)
- `com.1password.*` (1Password)
- `com.lastpass.*` (LastPass)
- `com.bitwarden.*` (Bitwarden)
- `com.apple.systempreferences` (System Preferences)
- `com.apple.Terminal` (Terminal – opt-in only)
- `com.googlecode.iterm2` (iTerm – opt-in only)
- Banking apps (detected by bundle ID patterns)

Users can add/remove apps from the blacklist in Settings.

---

## Appendix B: Redaction Patterns

| Pattern | Redaction | Example |
|---------|-----------|---------|
| `input[type="password"]` | Field removed entirely | – |
| Credit card number regex | Replace with `[CARD]` | `4111****1111` → `[CARD]` |
| SSN regex | Replace with `[SSN]` | `123-45-6789` → `[SSN]` |
| API key patterns | Replace with `[KEY]` | `sk-abc123...` → `[KEY]` |
| Email in sensitive context | Hash local part | `user@example.com` → `a1b2c3@example.com` |
| URLs with tokens | Strip query params | `?token=abc` → `?token=[REDACTED]` |

---

## 15. Notifications

The system uses layered notifications to surface proposals without requiring constant Ops Inbox monitoring.

### 15.1 Notification Channels

| Channel | Purpose | When Used |
|---------|---------|-----------|
| **Dock badge** | Passive count of pending proposals | Always (when proposals exist) |
| **Menu bar widget** | Quick glance at top proposals + one-click approve | Always visible |
| **macOS notifications** | Push for high-confidence (≥60) proposals | Configurable; default ON |
| **Sound/chime** | Audio cue for new proposals | Configurable; default OFF |

### 15.2 Menu Bar Widget

A lightweight always-visible component showing:

```
┌─────────────────────────────┐
│ ⚡ Eigent Ops        3 │
├─────────────────────────────┤
│ 📧 Reply to Sarah    [✓][✗] │
│ 📅 Reschedule standup [✓][✗] │
│ 📝 Update project doc [✓][✗] │
├─────────────────────────────┤
│ Open Ops Inbox...           │
└─────────────────────────────┘
```

- Shows top 3 proposals by confidence
- One-click approve (✓) or decline (✗)
- Click proposal to open in Ops Inbox for editing
- Badge count updates in real-time

### 15.3 Notification Rules

| Confidence | macOS Notification | Sound |
|------------|-------------------|-------|
| 0-29 | None (auto-declined) | None |
| 30-59 | None (check Inbox manually) | None |
| 60-79 | "Proposal ready: [summary]" | Optional chime |
| 80-100 | "Ready to approve: [summary]" | Optional chime |

### 15.4 Do Not Disturb Integration

- Respects macOS Focus modes
- When Focus active: queue notifications, deliver on exit
- Manual "Ops DND" toggle in menu bar widget

---

## 16. Calendar Integration

Detailed workflows for Google Calendar automation.

### 16.1 Scheduling Meetings

**Trigger:** User types "schedule a meeting with X" or similar in any app

**Flow:**
1. Extract attendee(s) from context
2. Query Calendar API for mutual availability
3. Draft event with suggested times (top 3 slots)
4. Propose in Ops Inbox with time options
5. On approve: create event, send invites

**Draft includes:**
- Suggested title (inferred from context)
- Duration (default 30min, adjustable)
- Video link (auto-add Google Meet if enabled)
- Description (context from observation)

### 16.2 Rescheduling

**Trigger:** Conflict detected OR user mentions rescheduling

**Flow:**
1. Identify conflicting events
2. Query for alternative slots
3. Draft reschedule proposal with:
   - Original time
   - Conflict reason
   - Top 3 alternative times
4. On approve: update event, notify attendees

### 16.3 Meeting Prep Reminders

**Trigger:** 1 hour before scheduled meeting (configurable)

**Flow:**
1. Gather context:
   - Previous meetings with same attendee(s)
   - Recent email threads
   - Related documents
   - Last meeting notes
2. Surface as notification: "Meeting with X in 1 hour"
3. Click to view prep summary in Ops Inbox

**Prep summary includes:**
- Attendee context (title, company, last interaction)
- Open action items from previous meetings
- Relevant recent communications
- Suggested talking points

### 16.4 Auto-Triage Invites

**Trigger:** New calendar invite received

**Rules engine:**
| Rule | Action |
|------|--------|
| Recurring 1:1 with direct reports | Auto-accept |
| From VIP list | Auto-accept |
| Conflicts with existing event | Propose decline with reason |
| Outside working hours | Propose decline |
| No agenda/description | Propose "request agenda" reply |
| All others | Surface for manual decision |

**VIP list:** Configurable list of email addresses that bypass triage.

### 16.5 Post-Meeting Notes

**Trigger:** Meeting ends (detected via Calendar)

**Flow:**
1. Prompt: "Create notes for [meeting]?"
2. If approved, draft note with:
   - Attendees
   - Duration
   - Template sections (Discussion, Decisions, Action Items)
3. Create in Notion (or configured note destination)
4. Link to calendar event

---

## 17. Debugging & Troubleshooting

Tools for understanding why the system behaves as it does.

### 17.1 Timeline View

Shows everything that happened for a playbook or time period:

```
┌─────────────────────────────────────────────────────────────┐
│ Timeline: "Reply to recruiter emails"          Jan 17, 2026 │
├─────────────────────────────────────────────────────────────┤
│ 09:15:32  ObservationEvent: Gmail tab focused               │
│ 09:15:33  ObservationEvent: Email from recruiter@acme.com   │
│ 09:15:34  TaskEpisode created: "Recruiter email received"   │
│ 09:15:35  Playbook matched: "Reply to recruiter emails"     │
│ 09:15:36  Draft generated (confidence: 72)                  │
│ 09:15:36  ProposedAction created                            │
│ 09:17:42  User approved (no edits)                          │
│ 09:17:43  Execution started                                 │
│ 09:17:44  Gmail API: draft created                          │
│ 09:17:45  Gmail API: draft sent                             │
│ 09:17:45  ExecutionResult: SUCCESS                          │
└─────────────────────────────────────────────────────────────┘
```

### 17.2 Explain Mode

Answer "Why did/didn't this trigger?" with reasoning trace:

```
┌─────────────────────────────────────────────────────────────┐
│ Explain: Why didn't "Auto-reply to recruiter" trigger?      │
├─────────────────────────────────────────────────────────────┤
│ ❌ Playbook did NOT trigger                                 │
│                                                             │
│ Trigger conditions:                                         │
│   ✅ App: Gmail (matched com.google.Chrome + gmail.com)     │
│   ✅ Context: Email visible                                 │
│   ❌ Sender pattern: recruiter@* (actual: hr@acme.com)      │
│                                                             │
│ Suggestion: Update sender pattern to include "hr@*"         │
└─────────────────────────────────────────────────────────────┘
```

### 17.3 Replay Mode

Re-run a past observation sequence to test playbook changes:

1. Select a past TaskEpisode
2. Edit playbook trigger or action
3. Click "Replay"
4. See what would have happened with new rules
5. Compare to actual outcome

**Replay is read-only** — no side effects, just simulation.

### 17.4 Diff View

Compare playbook behavior across time periods:

```
┌─────────────────────────────────────────────────────────────┐
│ Diff: "Reply to recruiter" — Last week vs This week         │
├─────────────────────────────────────────────────────────────┤
│                          Last Week    This Week    Delta    │
│ Triggers                      12          3        -75%     │
│ Avg confidence               78         45        -33       │
│ Approvals                    11          1        -91%      │
│ Edits before approve          1          2        +100%     │
│                                                             │
│ ⚠️  Possible cause: Gmail DOM structure changed on Jan 15   │
│     Selector ".email-sender" no longer matches              │
└─────────────────────────────────────────────────────────────┘
```

---

## 18. Integration Extensibility

Add new services beyond the built-in integrations via MCP.

### 18.1 Architecture

Each integration is an **MCP server** that exposes:
- **Context tools**: Read data from the service
- **Action tools**: Create/update/delete in the service
- **Schema**: Typed definitions for the service's data model

```
┌─────────────────────────────────────────────────────────────┐
│                     Eigent Ops Layer                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Gmail   │  │ Calendar│  │ Notion  │  │ Custom  │        │
│  │  MCP    │  │  MCP    │  │  MCP    │  │  MCP    │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │            │            │            │              │
│       └────────────┴────────────┴────────────┘              │
│                         │                                   │
│                    MCP Protocol                             │
│                         │                                   │
│              ┌──────────┴──────────┐                        │
│              │  Integration Router │                        │
│              └─────────────────────┘                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 18.2 Adding a Custom Integration

1. **Create MCP server** implementing the integration protocol:

```typescript
// Example: Linear MCP server
const server = new McpServer({
  name: "linear",
  version: "1.0.0",
});

// Context tool: read issues
server.tool("linear_get_issues", {
  project_id: z.string(),
}, async ({ project_id }) => {
  const issues = await linearClient.issues({ projectId: project_id });
  return { issues };
});

// Action tool: create issue
server.tool("linear_create_issue", {
  title: z.string(),
  description: z.string(),
  project_id: z.string(),
}, async ({ title, description, project_id }) => {
  const issue = await linearClient.createIssue({ title, description, projectId: project_id });
  return { issue_id: issue.id, url: issue.url };
});
```

2. **Register with Eigent** via settings:

```json
{
  "integrations": {
    "linear": {
      "mcp_command": ["node", "~/.eigent/integrations/linear-mcp/index.js"],
      "capabilities": ["context", "action"],
      "auth": {
        "type": "api_key",
        "env_var": "LINEAR_API_KEY"
      }
    }
  }
}
```

3. **Use in playbooks** — integration tools become available:

```json
{
  "trigger": { "app_pattern": "Linear" },
  "actions": [
    { "tool": "linear_create_issue", "params": { "..." } }
  ]
}
```

### 18.3 Built-in Integrations

| Service | MCP Server | Status |
|---------|------------|--------|
| Gmail | `@eigent/gmail-mcp` | Built-in |
| Google Calendar | `@eigent/calendar-mcp` | Built-in |
| Notion | `@eigent/notion-mcp` | Built-in |
| Google Drive | `@eigent/drive-mcp` | Built-in |

### 18.4 Integration Discovery

- Eigent scans `~/.eigent/integrations/` for MCP servers
- Each integration must have a `manifest.json` with metadata
- Hot-reload: add integration without restarting Eigent

---

## 19. Data Sync & Backup

Sync playbooks, history, and settings to Google Drive for durability and multi-Mac support.

### 19.1 What Syncs

| Data | Syncs | Location |
|------|-------|----------|
| Playbooks | ✅ Yes | `Google Drive/Eigent/playbooks/` |
| Decision history | ✅ Yes | `Google Drive/Eigent/history/` |
| Settings | ✅ Yes | `Google Drive/Eigent/settings.json` |
| Observation events | ❌ No | Local only (privacy) |
| Session tokens | ❌ No | Local Keychain only |

### 19.2 Sync Mechanism

```
┌─────────────────────────────────────────────────────────────┐
│                        Sync Flow                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Local DB ──────► Sync Engine ──────► Google Drive         │
│      │                  │                    │              │
│      │                  │                    │              │
│      ▼                  ▼                    ▼              │
│  SQLite            Conflict              JSON files         │
│  (~/.eigent/)      Resolution            (encrypted)        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Sync frequency:**
- On playbook create/edit: immediate
- On decision: batched every 5 minutes
- On settings change: immediate
- Full sync: every hour (background)

### 19.3 Conflict Resolution

When same playbook edited on multiple Macs:

1. **Last-write-wins** for simple fields (name, description)
2. **Merge** for stats (sum executions, max of dates)
3. **Prompt** for trigger/action changes (show diff, ask which to keep)

### 19.4 Encryption

All synced data is encrypted before upload:

- **Algorithm:** AES-256-GCM
- **Key derivation:** PBKDF2 from user passphrase
- **Passphrase:** Set on first sync, stored in macOS Keychain
- **Recovery:** Export key to secure location (user responsibility)

### 19.5 Multi-Mac Setup

1. Install Eigent on second Mac
2. Sign in to Google Drive
3. Enter sync passphrase
4. Playbooks and settings download automatically
5. Observation starts fresh (local only)

### 19.6 Export/Import

For manual backup or migration:

- **Export:** `Eigent → Settings → Export Data` → ZIP file with all playbooks + history
- **Import:** `Eigent → Settings → Import Data` → select ZIP
- Format is human-readable JSON (for inspection/editing)
