# 10x Eigent: Design Document

## Context

**Goal:** Build a commercial fork of Eigent that 10x improves user experience and capabilities.

**Target market:** Enterprise/B2B and prosumers passionate about AGI.

**First blocker:** z.ai GLM integration - cannot use Eigent without it.

## Architecture Overview

Six layers transform Eigent from a basic multi-agent tool into a production-grade AI workforce platform:

```
┌─────────────────────────────────────────────────────────┐
│  Layer 6: Error Handling & Recovery                     │
│  Checkpoints, graceful degradation, user-assisted fixes │
├─────────────────────────────────────────────────────────┤
│  Layer 5: UX Observability & Control                    │
│  Live task graphs, reasoning panels, intervention points│
├─────────────────────────────────────────────────────────┤
│  Layer 4: Context & Memory                              │
│  User prefs, org knowledge, task history, learning      │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Multi-Agent Coordination                      │
│  Orchestrator, agent communication, dependency graphs   │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Agent Intelligence                            │
│  Reasoning traces, self-reflection, dynamic planning    │
├─────────────────────────────────────────────────────────┤
│  Layer 1: Foundation - Model Flexibility                │
│  Universal adapter, routing, fallbacks, cost tracking   │
└─────────────────────────────────────────────────────────┘
```

---

## Layer 1: Foundation - Model Flexibility

### Problem

Eigent locks users into specific providers. z.ai GLM support requires code changes. Model choice matters to enterprises and AGI enthusiasts.

### Solution

**Universal model adapter** - Any OpenAI-compatible API works: z.ai, Groq, Together, Ollama, vLLM.

**Model routing** - Assign different models to different agents. Use cheap models for simple tasks, powerful models for reasoning.

**Fallback chains** - When primary model fails or hits rate limits, try alternatives automatically.

**Cost tracking** - Track token spend per task, per agent, per organization.

### Technical Approach

Refactor `backend/app/component/` and `server/app/controller/`:

1. Create `UniversalModelAdapter` that wraps any OpenAI-compatible endpoint
2. Add model capability metadata (function calling, vision, context length)
3. Implement routing logic in orchestration layer
4. Add cost aggregation to task completion events

### z.ai Integration

GLM-4 exposes an OpenAI-compatible API. Once the universal adapter exists, z.ai configuration requires only:
- API endpoint URL
- API key
- Model identifier

---

## Layer 2: Agent Intelligence

### Problem

Agents execute rigid patterns. They follow scripts without reasoning about approach. Users cannot see why agents make decisions.

### Solution

**Reasoning traces** - Agents think step-by-step with visible chain-of-thought. Users inspect the reasoning.

**Self-reflection loops** - After each action, agents evaluate: Did this work? Should I adjust?

**Dynamic planning** - Agents decompose tasks into subtasks on the fly, adapting as they learn.

**Tool discovery** - Agents reason about which tools fit the problem, rather than following hardcoded mappings.

### Technical Approach

Modify agent configuration in `backend/app/component/`:

1. Wrap agent calls with reasoning prompts that force explicit planning
2. Add reflection step after each major action
3. Expose reasoning traces via WebSocket to frontend
4. Implement planner agent that coordinates specialists

### Key Insight

Better intelligence and better UX are the same thing. Agents that think out loud help users understand what's happening. Transparency is the feature.

---

## Layer 3: Multi-Agent Coordination

### Problem

Eigent's agents work in sequence or simple parallel. They don't collaborate, negotiate, or handle complex dependencies. Handoffs lose context.

### Solution

**Hierarchical orchestration** - Manager agent understands the full task, delegates to specialists, synthesizes results.

**Agent communication** - Specialists ask each other questions mid-task.

**Dependency graphs** - Visual representation of subtasks and their relationships.

**Handoff protocols** - Clean contracts define what one agent passes to another.

**Conflict resolution** - Explicit mechanisms resolve contradictory agent outputs.

### Technical Approach

Build orchestration in `backend/app/service/`:

1. Create `OrchestratorAgent` with access to all specialist capabilities
2. Define message-passing protocol between agents
3. Build task graph structure tracking dependencies and state
4. Surface graph to frontend via `src/store/chatStore.ts`

### Enterprise Differentiator

Most AI tools are single-agent. True multi-agent coordination that works is rare. This is the competitive moat.

---

## Layer 4: Context & Memory

### Problem

Agents start from zero every task. They forget user preferences, past solutions, project context. Users repeat themselves constantly.

### Solution

**Memory hierarchy:**

```
User
├── Personal preferences (coding style, communication)
├── Organization A
│   ├── Org knowledge (tech stack, conventions)
│   ├── Project memories (past tasks, decisions)
│   └── Team preferences
├── Organization B
│   ├── Org knowledge (different stack)
│   ├── Project memories
│   └── Team preferences
└── Organization C...
```

**Strict isolation** - Work for Org A never leaks Org B context.

**Inheritance** - Personal preferences flow down; org-specific settings override.

**Context switching** - Clear UI to switch organizations; agents adopt that org's knowledge.

**Learning from feedback** - Corrections inform future behavior.

### Technical Approach

1. **Short-term:** Sliding window context in agent calls (exists)
2. **Medium-term:** Session-scoped memory store (Redis/in-memory)
3. **Long-term:** Vector database for semantic search over history
4. **RAG:** Inject relevant memories into agent prompts

### Multi-Org Architecture

Database schema:

```sql
users (id, preferences_json)
organizations (id, name, knowledge_base_id)
org_memberships (user_id, org_id, role)
memories (id, org_id, user_id, type, content, embedding)
```

Query memories scoped to current org. Personal preferences come from user record.

---

## Layer 5: UX Observability & Control

### Problem

AI agents are black boxes. Users wait and hope. Failures produce cryptic errors. Successes cannot be reproduced.

### Solution

**Live task graph** - Visual display: which agents, which subtasks, running/blocked/done status.

**Reasoning panel** - Real-time agent thinking, expandable for detail.

**Intervention points** - Pause, inspect state, modify plan, redirect agents mid-task.

**Confidence indicators** - Agents signal uncertainty, prompt user input before proceeding.

**Audit trail** - Every action logged with reasoning. Reviewable later.

### Technical Approach

Frontend work in `src/components/` and `src/store/`:

1. Extend `chatStore.ts` to track task graphs, not just messages
2. Build `TaskGraphView` component using `@xyflow/react`
3. Stream updates via WebSocket/SSE
4. Add pause/resume/redirect IPC calls to backend orchestrator

### Prosumer Angle

AGI enthusiasts want to see the thinking. Watching agents reason is part of the product experience.

---

## Layer 6: Error Handling & Recovery

### Problem

When agents fail, users see cryptic errors, lose progress, start over. This destroys trust faster than any other issue.

### Solution

**Graceful degradation** - Agents try alternatives before giving up.

**Checkpoint & resume** - Long tasks save state. Crashes resume from checkpoint.

**User-assisted recovery** - When stuck, agents ask specific questions rather than failing.

**Error explanation** - Plain-language description of what went wrong.

**Retry with guidance** - "This failed because X. Try Y instead?" User stays in control.

### Technical Approach

1. Wrap tool calls with context-aware error handling
2. Implement task checkpointing (serialize state to DB)
3. Define "agent stuck" protocol for requesting human help
4. Build `ErrorRecovery` component presenting options
5. Add retry logic with exponential backoff and alternative strategies

### Enterprise Requirement

"Works 80% of the time" fails in business contexts. Error recovery makes the difference between demo and production.

---

## Implementation Sequence

Recommended order based on dependencies and impact:

### Phase 1: Foundation (Unblocks Usage)
- [ ] Universal model adapter
- [ ] z.ai GLM integration
- [ ] Basic model routing

### Phase 2: Intelligence (Core Differentiator)
- [ ] Reasoning traces
- [ ] Self-reflection loops
- [ ] Expose reasoning to frontend

### Phase 3: Memory (Stickiness)
- [ ] User preferences store
- [ ] Organization model
- [ ] Memory isolation

### Phase 4: Coordination (Scale)
- [ ] Orchestrator agent
- [ ] Agent communication protocol
- [ ] Task dependency graphs

### Phase 5: Observability (Polish)
- [ ] Task graph visualization
- [ ] Intervention controls
- [ ] Audit trail

### Phase 6: Resilience (Production)
- [ ] Checkpointing
- [ ] Error recovery flows
- [ ] Fallback chains

---

## Success Metrics

| Layer | Metric | Target |
|-------|--------|--------|
| Foundation | Models supported | Any OpenAI-compatible |
| Intelligence | User understanding | 80%+ know what agent is doing |
| Coordination | Complex task success | 2x current rate |
| Memory | Repeat instructions | 50% reduction |
| Observability | User interventions | Available at any point |
| Resilience | Recovery from failure | 90%+ without restart |

---

## Open Questions

1. **Vector DB choice** - Local (Chroma, LanceDB) vs hosted (Pinecone, Weaviate)?
2. **Pricing model** - Per-seat, per-token, per-task?
3. **Branding** - Keep Eigent name or rename for commercial fork?
4. **Upstream relationship** - Contribute improvements back or diverge?
