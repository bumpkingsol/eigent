# 10x Eigent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Eigent into a 10x commercial fork with universal model support, intelligent agents, multi-org memory, and production-grade UX.

**Architecture:** Six-layer enhancement - Foundation (model flexibility), Intelligence (reasoning), Coordination (multi-agent), Memory (user+org context), Observability (UX), Resilience (error handling). Each layer builds on the previous.

**Tech Stack:** React + TypeScript + Zustand (frontend), Python + FastAPI + CAMEL-AI (backend), PostgreSQL + vector DB (storage), SSE (real-time).

---

## Phase 1: Foundation - Universal Model Adapter

### Task 1.1: Create Universal Model Adapter Interface

**Files:**
- Create: `backend/app/component/model_adapter.py`
- Test: `backend/tests/test_model_adapter.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_model_adapter.py
import pytest
from app.component.model_adapter import UniversalModelAdapter, ModelCapabilities

def test_adapter_creates_openai_compatible_model():
    adapter = UniversalModelAdapter(
        endpoint_url="https://api.z.ai/api/paas/v4/",
        api_key="test-key",
        model_name="glm-4"
    )
    assert adapter.endpoint_url == "https://api.z.ai/api/paas/v4/"
    assert adapter.capabilities.supports_function_calling is True

def test_adapter_validates_endpoint():
    with pytest.raises(ValueError, match="Invalid endpoint"):
        UniversalModelAdapter(
            endpoint_url="not-a-url",
            api_key="test-key",
            model_name="test"
        )
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_model_adapter.py -v`
Expected: FAIL with "No module named 'app.component.model_adapter'"

**Step 3: Write minimal implementation**

```python
# backend/app/component/model_adapter.py
from dataclasses import dataclass
from urllib.parse import urlparse
from camel.models import ModelFactory
from camel.types import ModelPlatformType

@dataclass
class ModelCapabilities:
    supports_function_calling: bool = True
    supports_vision: bool = False
    supports_streaming: bool = True
    max_context_length: int = 128000

@dataclass
class UniversalModelAdapter:
    endpoint_url: str
    api_key: str
    model_name: str
    capabilities: ModelCapabilities = None

    def __post_init__(self):
        parsed = urlparse(self.endpoint_url)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError(f"Invalid endpoint: {self.endpoint_url}")
        if self.capabilities is None:
            self.capabilities = ModelCapabilities()

    def create_model(self, **kwargs):
        """Create CAMEL model instance."""
        return ModelFactory.create(
            model_platform=ModelPlatformType.OPENAI_COMPATIBLE_MODEL,
            model_type=self.model_name,
            api_key=self.api_key,
            url=self.endpoint_url,
            **kwargs
        )
```

**Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_model_adapter.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/component/model_adapter.py backend/tests/test_model_adapter.py
git commit -m "feat(models): add UniversalModelAdapter for OpenAI-compatible APIs"
```

---

### Task 1.2: Add Model Registry with Capability Detection

**Files:**
- Modify: `backend/app/component/model_adapter.py`
- Test: `backend/tests/test_model_adapter.py`

**Step 1: Write the failing test**

```python
# Add to backend/tests/test_model_adapter.py
def test_model_registry_stores_adapters():
    from app.component.model_adapter import ModelRegistry

    registry = ModelRegistry()
    registry.register(
        provider_id="z.ai",
        endpoint_url="https://api.z.ai/api/paas/v4/",
        api_key="test-key",
        models=["glm-4", "glm-4-plus"]
    )

    adapter = registry.get_adapter("z.ai", "glm-4")
    assert adapter is not None
    assert adapter.model_name == "glm-4"

def test_registry_returns_none_for_unknown():
    from app.component.model_adapter import ModelRegistry

    registry = ModelRegistry()
    adapter = registry.get_adapter("unknown", "model")
    assert adapter is None
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_model_adapter.py::test_model_registry_stores_adapters -v`
Expected: FAIL with "cannot import name 'ModelRegistry'"

**Step 3: Write minimal implementation**

```python
# Add to backend/app/component/model_adapter.py
from typing import Dict, List, Optional

class ModelRegistry:
    def __init__(self):
        self._adapters: Dict[str, Dict[str, UniversalModelAdapter]] = {}

    def register(
        self,
        provider_id: str,
        endpoint_url: str,
        api_key: str,
        models: List[str],
        capabilities: Optional[ModelCapabilities] = None
    ):
        if provider_id not in self._adapters:
            self._adapters[provider_id] = {}

        for model in models:
            self._adapters[provider_id][model] = UniversalModelAdapter(
                endpoint_url=endpoint_url,
                api_key=api_key,
                model_name=model,
                capabilities=capabilities or ModelCapabilities()
            )

    def get_adapter(self, provider_id: str, model_name: str) -> Optional[UniversalModelAdapter]:
        return self._adapters.get(provider_id, {}).get(model_name)

    def list_providers(self) -> List[str]:
        return list(self._adapters.keys())

    def list_models(self, provider_id: str) -> List[str]:
        return list(self._adapters.get(provider_id, {}).keys())
```

**Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_model_adapter.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/component/model_adapter.py backend/tests/test_model_adapter.py
git commit -m "feat(models): add ModelRegistry for provider management"
```

---

### Task 1.3: Integrate z.ai into Frontend Provider List

**Files:**
- Modify: `src/lib/llm.ts:68-75`

**Step 1: Verify current z.ai config**

Read the file to confirm z.ai is already defined (from exploration, it is).

**Step 2: Ensure z.ai config is complete**

```typescript
// src/lib/llm.ts - verify this block exists around line 68
{
  name: "Z.ai",
  endpoint: "https://api.z.ai/api/paas/v4/",
  models: [],
  placeholder: "Enter your Z.ai API key",
  imgSrc: zaiLogo,
  helpLink: "https://z.ai",
},
```

**Step 3: Add GLM model definitions**

```typescript
// Update the Z.ai entry with specific models
{
  name: "Z.ai",
  endpoint: "https://api.z.ai/api/paas/v4/",
  models: [
    { name: "glm-4-plus", label: "GLM-4 Plus" },
    { name: "glm-4", label: "GLM-4" },
    { name: "glm-4-air", label: "GLM-4 Air" },
    { name: "glm-4-flash", label: "GLM-4 Flash" },
  ],
  placeholder: "Enter your Z.ai API key",
  imgSrc: zaiLogo,
  helpLink: "https://open.bigmodel.cn/",
},
```

**Step 4: Run type check**

Run: `npm run type-check`
Expected: No TypeScript errors

**Step 5: Commit**

```bash
git add src/lib/llm.ts
git commit -m "feat(providers): add GLM model definitions for Z.ai"
```

---

### Task 1.4: Add Model Fallback Chain

**Files:**
- Create: `backend/app/component/model_fallback.py`
- Test: `backend/tests/test_model_fallback.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_model_fallback.py
import pytest
from unittest.mock import Mock, patch
from app.component.model_fallback import FallbackChain, ModelCallError

def test_fallback_tries_next_on_failure():
    chain = FallbackChain([
        {"provider": "primary", "model": "gpt-4"},
        {"provider": "fallback", "model": "glm-4"},
    ])

    # Mock: primary fails, fallback succeeds
    primary_adapter = Mock()
    primary_adapter.create_model.return_value.step.side_effect = Exception("Rate limit")

    fallback_adapter = Mock()
    fallback_response = Mock()
    fallback_response.msgs = [Mock(content="Success")]
    fallback_adapter.create_model.return_value.step.return_value = fallback_response

    with patch.object(chain, '_get_adapter', side_effect=[primary_adapter, fallback_adapter]):
        result = chain.call("test prompt")

    assert result.content == "Success"
    assert chain.last_used_provider == "fallback"

def test_fallback_raises_after_all_fail():
    chain = FallbackChain([
        {"provider": "a", "model": "m1"},
        {"provider": "b", "model": "m2"},
    ])

    failing_adapter = Mock()
    failing_adapter.create_model.return_value.step.side_effect = Exception("Failed")

    with patch.object(chain, '_get_adapter', return_value=failing_adapter):
        with pytest.raises(ModelCallError, match="All models failed"):
            chain.call("test prompt")
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_model_fallback.py -v`
Expected: FAIL with "No module named 'app.component.model_fallback'"

**Step 3: Write minimal implementation**

```python
# backend/app/component/model_fallback.py
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

class ModelCallError(Exception):
    """All fallback models failed."""
    pass

@dataclass
class FallbackChain:
    models: List[Dict[str, str]]
    registry: Any = None
    last_used_provider: Optional[str] = field(default=None, init=False)
    last_error: Optional[Exception] = field(default=None, init=False)

    def _get_adapter(self, provider: str, model: str):
        if self.registry:
            return self.registry.get_adapter(provider, model)
        # For testing without registry
        raise NotImplementedError("Registry required")

    def call(self, prompt: str, **kwargs) -> Any:
        errors = []

        for model_config in self.models:
            provider = model_config["provider"]
            model = model_config["model"]

            try:
                adapter = self._get_adapter(provider, model)
                agent = adapter.create_model(**kwargs)
                response = agent.step(prompt)
                self.last_used_provider = provider

                if hasattr(response, 'msgs') and response.msgs:
                    return response.msgs[0]
                return response

            except Exception as e:
                logger.warning(f"Model {provider}/{model} failed: {e}")
                errors.append((provider, model, e))
                self.last_error = e
                continue

        error_summary = "; ".join([f"{p}/{m}: {e}" for p, m, e in errors])
        raise ModelCallError(f"All models failed: {error_summary}")
```

**Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_model_fallback.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/component/model_fallback.py backend/tests/test_model_fallback.py
git commit -m "feat(models): add FallbackChain for automatic model failover"
```

---

### Task 1.5: Add Cost Tracking to Model Calls

**Files:**
- Create: `backend/app/component/cost_tracker.py`
- Test: `backend/tests/test_cost_tracker.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_cost_tracker.py
import pytest
from app.component.cost_tracker import CostTracker, TokenUsage

def test_cost_tracker_accumulates_usage():
    tracker = CostTracker()

    tracker.record(TokenUsage(
        provider="openai",
        model="gpt-4",
        input_tokens=100,
        output_tokens=50,
        cost_usd=0.015
    ))

    tracker.record(TokenUsage(
        provider="openai",
        model="gpt-4",
        input_tokens=200,
        output_tokens=100,
        cost_usd=0.030
    ))

    summary = tracker.get_summary()
    assert summary["total_cost_usd"] == 0.045
    assert summary["total_input_tokens"] == 300
    assert summary["total_output_tokens"] == 150
    assert summary["by_provider"]["openai"]["cost_usd"] == 0.045

def test_cost_tracker_separates_by_org():
    tracker = CostTracker()

    tracker.record(TokenUsage(
        provider="openai", model="gpt-4",
        input_tokens=100, output_tokens=50, cost_usd=0.015,
        org_id="org-1"
    ))
    tracker.record(TokenUsage(
        provider="openai", model="gpt-4",
        input_tokens=100, output_tokens=50, cost_usd=0.015,
        org_id="org-2"
    ))

    org1_summary = tracker.get_summary(org_id="org-1")
    assert org1_summary["total_cost_usd"] == 0.015
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_cost_tracker.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# backend/app/component/cost_tracker.py
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from collections import defaultdict

@dataclass
class TokenUsage:
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    org_id: Optional[str] = None
    task_id: Optional[str] = None

class CostTracker:
    def __init__(self):
        self._records: List[TokenUsage] = []

    def record(self, usage: TokenUsage):
        self._records.append(usage)

    def get_summary(self, org_id: Optional[str] = None, task_id: Optional[str] = None) -> Dict:
        filtered = self._records
        if org_id:
            filtered = [r for r in filtered if r.org_id == org_id]
        if task_id:
            filtered = [r for r in filtered if r.task_id == task_id]

        by_provider = defaultdict(lambda: {"cost_usd": 0, "input_tokens": 0, "output_tokens": 0})
        total_cost = 0
        total_input = 0
        total_output = 0

        for record in filtered:
            total_cost += record.cost_usd
            total_input += record.input_tokens
            total_output += record.output_tokens
            by_provider[record.provider]["cost_usd"] += record.cost_usd
            by_provider[record.provider]["input_tokens"] += record.input_tokens
            by_provider[record.provider]["output_tokens"] += record.output_tokens

        return {
            "total_cost_usd": total_cost,
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "by_provider": dict(by_provider),
            "record_count": len(filtered),
        }
```

**Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_cost_tracker.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/component/cost_tracker.py backend/tests/test_cost_tracker.py
git commit -m "feat(models): add CostTracker for token usage and spend tracking"
```

---

## Phase 2: Agent Intelligence - Reasoning Traces

### Task 2.1: Create Reasoning Trace Wrapper

**Files:**
- Create: `backend/app/component/reasoning.py`
- Test: `backend/tests/test_reasoning.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_reasoning.py
import pytest
from app.component.reasoning import ReasoningWrapper, ThoughtStep

def test_reasoning_wrapper_extracts_thoughts():
    wrapper = ReasoningWrapper()

    response_text = """
<thought>First, I need to understand the problem scope.</thought>
<thought>The user wants to process CSV data.</thought>
<action>I will use pandas to read the file.</action>
"""

    result = wrapper.parse_response(response_text)

    assert len(result.thoughts) == 2
    assert result.thoughts[0].content == "First, I need to understand the problem scope."
    assert result.action == "I will use pandas to read the file."

def test_reasoning_wrapper_creates_prompt():
    wrapper = ReasoningWrapper()

    enhanced = wrapper.enhance_prompt("Process this CSV file")

    assert "<thought>" in enhanced
    assert "step-by-step" in enhanced.lower()
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_reasoning.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# backend/app/component/reasoning.py
import re
from dataclasses import dataclass, field
from typing import List, Optional

@dataclass
class ThoughtStep:
    content: str
    step_number: int

@dataclass
class ReasoningResult:
    thoughts: List[ThoughtStep] = field(default_factory=list)
    action: Optional[str] = None
    raw_response: str = ""

REASONING_PROMPT_SUFFIX = """

Before taking action, think step-by-step about the problem.
Wrap each thought in <thought>...</thought> tags.
After reasoning, state your action in <action>...</action> tags.

Example:
<thought>First, I identify the core requirement.</thought>
<thought>Then, I consider the best approach.</thought>
<action>I will implement the solution using X.</action>
"""

class ReasoningWrapper:
    def __init__(self):
        self.thought_pattern = re.compile(r'<thought>(.*?)</thought>', re.DOTALL)
        self.action_pattern = re.compile(r'<action>(.*?)</action>', re.DOTALL)

    def enhance_prompt(self, prompt: str) -> str:
        return prompt + REASONING_PROMPT_SUFFIX

    def parse_response(self, response: str) -> ReasoningResult:
        thoughts = self.thought_pattern.findall(response)
        actions = self.action_pattern.findall(response)

        return ReasoningResult(
            thoughts=[
                ThoughtStep(content=t.strip(), step_number=i+1)
                for i, t in enumerate(thoughts)
            ],
            action=actions[0].strip() if actions else None,
            raw_response=response
        )
```

**Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_reasoning.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/component/reasoning.py backend/tests/test_reasoning.py
git commit -m "feat(intelligence): add ReasoningWrapper for chain-of-thought prompting"
```

---

### Task 2.2: Add Self-Reflection Loop

**Files:**
- Create: `backend/app/component/reflection.py`
- Test: `backend/tests/test_reflection.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_reflection.py
import pytest
from unittest.mock import Mock
from app.component.reflection import ReflectionLoop, ReflectionResult

def test_reflection_loop_approves_good_result():
    loop = ReflectionLoop()
    mock_agent = Mock()
    mock_agent.step.return_value = Mock(
        msgs=[Mock(content="The result looks correct and complete.")]
    )

    result = loop.reflect(
        agent=mock_agent,
        task="Calculate 2+2",
        result="4",
    )

    assert result.approved is True
    assert result.retry_count == 0

def test_reflection_loop_retries_on_issues():
    loop = ReflectionLoop(max_retries=2)
    mock_agent = Mock()

    # First reflection: needs improvement
    # Second reflection: approved
    mock_agent.step.side_effect = [
        Mock(msgs=[Mock(content="NEEDS_IMPROVEMENT: Missing explanation")]),
        Mock(msgs=[Mock(content="Result is now complete and correct.")]),
    ]

    mock_execute = Mock(side_effect=["4", "4 (2 plus 2 equals 4)"])

    result = loop.reflect(
        agent=mock_agent,
        task="Calculate 2+2",
        result="4",
        execute_fn=mock_execute,
    )

    assert result.approved is True
    assert result.retry_count == 1
    assert result.final_result == "4 (2 plus 2 equals 4)"
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_reflection.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# backend/app/component/reflection.py
from dataclasses import dataclass, field
from typing import Optional, Callable, Any, List

@dataclass
class ReflectionResult:
    approved: bool
    retry_count: int
    final_result: Any
    feedback_history: List[str] = field(default_factory=list)

REFLECTION_PROMPT = """
Evaluate this result for the given task.

Task: {task}
Result: {result}

Analyze:
1. Does the result fully address the task?
2. Are there any errors or omissions?
3. Could the result be improved?

If the result is acceptable, explain why it's good.
If it needs improvement, start your response with "NEEDS_IMPROVEMENT:" followed by specific feedback.
"""

class ReflectionLoop:
    def __init__(self, max_retries: int = 3):
        self.max_retries = max_retries

    def reflect(
        self,
        agent: Any,
        task: str,
        result: Any,
        execute_fn: Optional[Callable] = None,
    ) -> ReflectionResult:
        current_result = result
        feedback_history = []

        for retry in range(self.max_retries + 1):
            prompt = REFLECTION_PROMPT.format(task=task, result=current_result)
            response = agent.step(prompt)
            feedback = response.msgs[0].content if response.msgs else ""

            if "NEEDS_IMPROVEMENT:" not in feedback:
                return ReflectionResult(
                    approved=True,
                    retry_count=retry,
                    final_result=current_result,
                    feedback_history=feedback_history,
                )

            feedback_history.append(feedback)

            if execute_fn and retry < self.max_retries:
                current_result = execute_fn(feedback)

        return ReflectionResult(
            approved=False,
            retry_count=self.max_retries,
            final_result=current_result,
            feedback_history=feedback_history,
        )
```

**Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_reflection.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/component/reflection.py backend/tests/test_reflection.py
git commit -m "feat(intelligence): add ReflectionLoop for self-evaluation and retry"
```

---

### Task 2.3: Stream Reasoning Traces to Frontend

**Files:**
- Modify: `backend/app/service/task.py` (add new Action type)
- Modify: `src/store/chatStore.ts` (handle new event)
- Create: `src/components/ChatBox/ReasoningPanel.tsx`

**Step 1: Add action type to backend**

```python
# Add to backend/app/service/task.py Action enum (around line 35)
class Action(str, Enum):
    # ... existing actions ...
    reasoning_step = "reasoning_step"  # New: streaming thought steps
```

**Step 2: Add SSE handler in frontend**

```typescript
// Add to src/store/chatStore.ts in the onmessage handler (around line 1050)
// After the existing step handlers

case "reasoning_step": {
  const { thought, step_number, agent_name } = parsedData.data;
  const currentTask = getCurrentChatStore().tasks[getCurrentTaskId()];

  const updatedCotList = [...(currentTask?.cotList || [])];
  updatedCotList.push(`Step ${step_number}: ${thought}`);

  getCurrentChatStore().setCotList(getCurrentTaskId(), updatedCotList);
  break;
}
```

**Step 3: Create ReasoningPanel component**

```typescript
// src/components/ChatBox/ReasoningPanel.tsx
import { motion, AnimatePresence } from "framer-motion";
import { Brain, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface ReasoningPanelProps {
  thoughts: string[];
  agentName?: string;
  isExpanded?: boolean;
}

export function ReasoningPanel({ thoughts, agentName, isExpanded: initialExpanded = false }: ReasoningPanelProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  if (thoughts.length === 0) return null;

  return (
    <div className="border border-border/50 rounded-lg bg-muted/30 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between text-sm text-muted-foreground hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4" />
          <span>{agentName ? `${agentName}'s reasoning` : "Agent reasoning"}</span>
          <span className="text-xs">({thoughts.length} steps)</span>
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-3 pb-3"
          >
            <ol className="list-decimal list-inside space-y-1 text-sm">
              {thoughts.map((thought, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="text-foreground/80"
                >
                  {thought.replace(/^Step \d+: /, "")}
                </motion.li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

**Step 4: Run type check**

Run: `npm run type-check`
Expected: No errors

**Step 5: Commit**

```bash
git add backend/app/service/task.py src/store/chatStore.ts src/components/ChatBox/ReasoningPanel.tsx
git commit -m "feat(intelligence): stream reasoning traces to frontend with collapsible panel"
```

---

## Phase 3: Multi-Agent Coordination

### Task 3.1: Create Orchestrator Agent

**Files:**
- Create: `backend/app/component/orchestrator.py`
- Test: `backend/tests/test_orchestrator.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_orchestrator.py
import pytest
from unittest.mock import Mock, AsyncMock
from app.component.orchestrator import Orchestrator, TaskGraph, TaskNode

@pytest.mark.asyncio
async def test_orchestrator_creates_task_graph():
    orchestrator = Orchestrator()

    graph = await orchestrator.decompose(
        "Build a website with a contact form that sends emails"
    )

    assert isinstance(graph, TaskGraph)
    assert len(graph.nodes) > 0
    assert graph.root is not None

@pytest.mark.asyncio
async def test_orchestrator_identifies_dependencies():
    orchestrator = Orchestrator()

    graph = TaskGraph()
    graph.add_node(TaskNode(id="1", content="Create HTML structure", agent="developer"))
    graph.add_node(TaskNode(id="2", content="Add CSS styling", agent="developer", depends_on=["1"]))
    graph.add_node(TaskNode(id="3", content="Implement form submission", agent="developer", depends_on=["1"]))

    ready = graph.get_ready_tasks()
    assert len(ready) == 1
    assert ready[0].id == "1"

    graph.mark_complete("1")
    ready = graph.get_ready_tasks()
    assert len(ready) == 2  # Tasks 2 and 3 can now run in parallel
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_orchestrator.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# backend/app/component/orchestrator.py
from dataclasses import dataclass, field
from typing import List, Optional, Set, Dict
from enum import Enum

class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

@dataclass
class TaskNode:
    id: str
    content: str
    agent: str
    depends_on: List[str] = field(default_factory=list)
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[str] = None

class TaskGraph:
    def __init__(self):
        self.nodes: Dict[str, TaskNode] = {}
        self.root: Optional[str] = None

    def add_node(self, node: TaskNode):
        self.nodes[node.id] = node
        if not node.depends_on and self.root is None:
            self.root = node.id

    def get_ready_tasks(self) -> List[TaskNode]:
        ready = []
        for node in self.nodes.values():
            if node.status != TaskStatus.PENDING:
                continue

            deps_satisfied = all(
                self.nodes[dep_id].status == TaskStatus.COMPLETED
                for dep_id in node.depends_on
                if dep_id in self.nodes
            )

            if deps_satisfied:
                ready.append(node)

        return ready

    def mark_complete(self, node_id: str, result: Optional[str] = None):
        if node_id in self.nodes:
            self.nodes[node_id].status = TaskStatus.COMPLETED
            self.nodes[node_id].result = result

    def mark_running(self, node_id: str):
        if node_id in self.nodes:
            self.nodes[node_id].status = TaskStatus.RUNNING

    def mark_failed(self, node_id: str):
        if node_id in self.nodes:
            self.nodes[node_id].status = TaskStatus.FAILED

class Orchestrator:
    async def decompose(self, task: str) -> TaskGraph:
        # Placeholder - will integrate with CAMEL task decomposition
        graph = TaskGraph()
        graph.add_node(TaskNode(
            id="1",
            content=task,
            agent="developer"
        ))
        return graph
```

**Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_orchestrator.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/component/orchestrator.py backend/tests/test_orchestrator.py
git commit -m "feat(coordination): add Orchestrator with TaskGraph for dependency tracking"
```

---

### Task 3.2: Add Agent Communication Protocol

**Files:**
- Create: `backend/app/component/agent_protocol.py`
- Test: `backend/tests/test_agent_protocol.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_agent_protocol.py
import pytest
from app.component.agent_protocol import AgentMessage, MessageBus, MessageType

@pytest.mark.asyncio
async def test_message_bus_routes_to_recipient():
    bus = MessageBus()
    received = []

    async def handler(msg: AgentMessage):
        received.append(msg)

    bus.subscribe("browser_agent", handler)

    await bus.send(AgentMessage(
        sender="developer_agent",
        recipient="browser_agent",
        message_type=MessageType.REQUEST,
        content="Please find the API documentation for pandas"
    ))

    assert len(received) == 1
    assert received[0].content == "Please find the API documentation for pandas"

@pytest.mark.asyncio
async def test_message_bus_broadcasts_to_all():
    bus = MessageBus()
    received_a = []
    received_b = []

    async def handler_a(msg): received_a.append(msg)
    async def handler_b(msg): received_b.append(msg)

    bus.subscribe("agent_a", handler_a)
    bus.subscribe("agent_b", handler_b)

    await bus.broadcast(AgentMessage(
        sender="orchestrator",
        recipient="*",
        message_type=MessageType.INFO,
        content="Task priority has changed"
    ))

    assert len(received_a) == 1
    assert len(received_b) == 1
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_agent_protocol.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# backend/app/component/agent_protocol.py
from dataclasses import dataclass, field
from typing import Dict, List, Callable, Awaitable, Optional
from enum import Enum
from datetime import datetime
import asyncio

class MessageType(str, Enum):
    REQUEST = "request"
    RESPONSE = "response"
    INFO = "info"
    ERROR = "error"

@dataclass
class AgentMessage:
    sender: str
    recipient: str
    message_type: MessageType
    content: str
    correlation_id: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.now)

MessageHandler = Callable[[AgentMessage], Awaitable[None]]

class MessageBus:
    def __init__(self):
        self._subscribers: Dict[str, List[MessageHandler]] = {}
        self._pending_responses: Dict[str, asyncio.Future] = {}

    def subscribe(self, agent_id: str, handler: MessageHandler):
        if agent_id not in self._subscribers:
            self._subscribers[agent_id] = []
        self._subscribers[agent_id].append(handler)

    def unsubscribe(self, agent_id: str):
        self._subscribers.pop(agent_id, None)

    async def send(self, message: AgentMessage):
        handlers = self._subscribers.get(message.recipient, [])
        for handler in handlers:
            await handler(message)

    async def broadcast(self, message: AgentMessage):
        for agent_id, handlers in self._subscribers.items():
            if agent_id != message.sender:
                for handler in handlers:
                    await handler(message)

    async def request(self, message: AgentMessage, timeout: float = 30.0) -> AgentMessage:
        import uuid
        correlation_id = str(uuid.uuid4())
        message.correlation_id = correlation_id

        future = asyncio.get_event_loop().create_future()
        self._pending_responses[correlation_id] = future

        try:
            await self.send(message)
            return await asyncio.wait_for(future, timeout=timeout)
        finally:
            self._pending_responses.pop(correlation_id, None)

    async def respond(self, original: AgentMessage, response_content: str):
        if original.correlation_id and original.correlation_id in self._pending_responses:
            response = AgentMessage(
                sender=original.recipient,
                recipient=original.sender,
                message_type=MessageType.RESPONSE,
                content=response_content,
                correlation_id=original.correlation_id
            )
            self._pending_responses[original.correlation_id].set_result(response)
```

**Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_agent_protocol.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/component/agent_protocol.py backend/tests/test_agent_protocol.py
git commit -m "feat(coordination): add MessageBus for inter-agent communication"
```

---

## Phase 4: Context & Memory

### Task 4.1: Create Organization Model

**Files:**
- Create: `server/app/model/organization/organization.py`
- Create: `server/alembic/versions/xxxx_add_organizations.py`

**Step 1: Create the Organization model**

```python
# server/app/model/organization/organization.py
from typing import Optional
from sqlmodel import Field, Relationship
from app.model.abstract.model import AbstractModel, DefaultTimes

class Organization(AbstractModel, DefaultTimes, table=True):
    __tablename__ = "organizations"

    id: int = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: Optional[str] = None
    knowledge_base_config: Optional[dict] = Field(default=None, sa_type=JSON)
    settings: Optional[dict] = Field(default=None, sa_type=JSON)
    owner_id: int = Field(foreign_key="user.id", index=True)

class OrganizationMembership(AbstractModel, DefaultTimes, table=True):
    __tablename__ = "organization_memberships"

    id: int = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    organization_id: int = Field(foreign_key="organizations.id", index=True)
    role: str = Field(default="member")  # owner, admin, member
```

**Step 2: Create Alembic migration**

Run: `cd server && uv run alembic revision --autogenerate -m "add organizations"`

**Step 3: Run migration**

Run: `cd server && uv run alembic upgrade head`
Expected: Migration applies successfully

**Step 4: Commit**

```bash
git add server/app/model/organization/ server/alembic/versions/
git commit -m "feat(memory): add Organization and OrganizationMembership models"
```

---

### Task 4.2: Create Memory Storage with Org Isolation

**Files:**
- Create: `server/app/model/memory/memory.py`
- Create: `server/app/controller/memory/memory_controller.py`

**Step 1: Create Memory model**

```python
# server/app/model/memory/memory.py
from typing import Optional
from sqlmodel import Field
from sqlalchemy import Column, JSON
from app.model.abstract.model import AbstractModel, DefaultTimes
from pgvector.sqlalchemy import Vector  # Will need pgvector extension

class Memory(AbstractModel, DefaultTimes, table=True):
    __tablename__ = "memories"

    id: int = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    organization_id: Optional[int] = Field(foreign_key="organizations.id", index=True, nullable=True)

    memory_type: str = Field(index=True)  # preference, task_history, knowledge
    content: str
    metadata: Optional[dict] = Field(default=None, sa_column=Column(JSON))

    # For semantic search (requires pgvector)
    # embedding: List[float] = Field(sa_column=Column(Vector(1536)))

class UserPreference(AbstractModel, DefaultTimes, table=True):
    __tablename__ = "user_preferences"

    id: int = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True, unique=True)

    coding_style: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    communication_preferences: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    tool_preferences: Optional[dict] = Field(default=None, sa_column=Column(JSON))
```

**Step 2: Create Memory controller**

```python
# server/app/controller/memory/memory_controller.py
from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from app.component.database import session
from app.component.auth import Auth, auth_must
from app.model.memory.memory import Memory, UserPreference
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(prefix="/memory", tags=["Memory"])

class MemoryCreate(BaseModel):
    organization_id: Optional[int] = None
    memory_type: str
    content: str
    metadata: Optional[dict] = None

class MemoryOut(BaseModel):
    id: int
    memory_type: str
    content: str
    metadata: Optional[dict]
    organization_id: Optional[int]

@router.post("/", response_model=MemoryOut)
def create_memory(
    data: MemoryCreate,
    auth: Auth = Depends(auth_must),
    s: Session = Depends(session)
):
    memory = Memory(
        user_id=auth.id,
        organization_id=data.organization_id,
        memory_type=data.memory_type,
        content=data.content,
        metadata=data.metadata
    )
    memory.save(s)
    return memory

@router.get("/", response_model=List[MemoryOut])
def list_memories(
    organization_id: Optional[int] = None,
    memory_type: Optional[str] = None,
    auth: Auth = Depends(auth_must),
    s: Session = Depends(session)
):
    stmt = select(Memory).where(
        Memory.user_id == auth.id,
        Memory.no_delete()
    )

    if organization_id is not None:
        stmt = stmt.where(Memory.organization_id == organization_id)
    if memory_type:
        stmt = stmt.where(Memory.memory_type == memory_type)

    return s.exec(stmt).all()

@router.get("/preferences")
def get_preferences(
    auth: Auth = Depends(auth_must),
    s: Session = Depends(session)
):
    prefs = s.exec(
        select(UserPreference).where(UserPreference.user_id == auth.id)
    ).first()

    if not prefs:
        prefs = UserPreference(user_id=auth.id)
        prefs.save(s)

    return prefs

@router.put("/preferences")
def update_preferences(
    coding_style: Optional[dict] = None,
    communication_preferences: Optional[dict] = None,
    tool_preferences: Optional[dict] = None,
    auth: Auth = Depends(auth_must),
    s: Session = Depends(session)
):
    prefs = s.exec(
        select(UserPreference).where(UserPreference.user_id == auth.id)
    ).first()

    if not prefs:
        prefs = UserPreference(user_id=auth.id)

    if coding_style is not None:
        prefs.coding_style = coding_style
    if communication_preferences is not None:
        prefs.communication_preferences = communication_preferences
    if tool_preferences is not None:
        prefs.tool_preferences = tool_preferences

    prefs.save(s)
    return prefs
```

**Step 3: Register router**

Add to `server/app/__init__.py`:
```python
from app.controller.memory.memory_controller import router as memory_router
# In register_routers:
app.include_router(memory_router)
```

**Step 4: Create and run migration**

Run: `cd server && uv run alembic revision --autogenerate -m "add memory tables"`
Run: `cd server && uv run alembic upgrade head`

**Step 5: Commit**

```bash
git add server/app/model/memory/ server/app/controller/memory/ server/alembic/versions/
git commit -m "feat(memory): add Memory and UserPreference models with org isolation"
```

---

## Phase 5: UX Observability

### Task 5.1: Create Task Graph Visualization Component

**Files:**
- Create: `src/components/TaskGraph/index.tsx`
- Create: `src/components/TaskGraph/TaskNode.tsx`

**Step 1: Create TaskGraph component using React Flow**

```typescript
// src/components/TaskGraph/index.tsx
import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TaskNode } from "./TaskNode";

interface TaskData {
  id: string;
  content: string;
  status: "pending" | "running" | "completed" | "failed";
  agent?: string;
  depends_on?: string[];
}

interface TaskGraphProps {
  tasks: TaskData[];
  onTaskClick?: (taskId: string) => void;
}

const nodeTypes = {
  task: TaskNode,
};

export function TaskGraph({ tasks, onTaskClick }: TaskGraphProps) {
  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map<string, Node>();
    const edgeList: Edge[] = [];

    // Create nodes with layout
    tasks.forEach((task, index) => {
      const row = Math.floor(index / 3);
      const col = index % 3;

      nodeMap.set(task.id, {
        id: task.id,
        type: "task",
        position: { x: col * 250, y: row * 150 },
        data: {
          label: task.content,
          status: task.status,
          agent: task.agent,
          onClick: () => onTaskClick?.(task.id),
        },
      });
    });

    // Create edges from dependencies
    tasks.forEach((task) => {
      task.depends_on?.forEach((depId) => {
        edgeList.push({
          id: `${depId}-${task.id}`,
          source: depId,
          target: task.id,
          markerEnd: { type: MarkerType.ArrowClosed },
          animated: nodeMap.get(depId)?.data.status === "running",
        });
      });
    });

    return { nodes: Array.from(nodeMap.values()), edges: edgeList };
  }, [tasks, onTaskClick]);

  const [flowNodes, setNodes, onNodesChange] = useNodesState(nodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(edges);

  return (
    <div className="h-[400px] w-full border rounded-lg overflow-hidden">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
```

**Step 2: Create TaskNode component**

```typescript
// src/components/TaskGraph/TaskNode.tsx
import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { CheckCircle, Circle, Loader2, XCircle } from "lucide-react";

interface TaskNodeData {
  label: string;
  status: "pending" | "running" | "completed" | "failed";
  agent?: string;
  onClick?: () => void;
}

const statusIcons = {
  pending: Circle,
  running: Loader2,
  completed: CheckCircle,
  failed: XCircle,
};

const statusColors = {
  pending: "border-muted-foreground/30 bg-muted/50",
  running: "border-blue-500 bg-blue-500/10",
  completed: "border-green-500 bg-green-500/10",
  failed: "border-red-500 bg-red-500/10",
};

export const TaskNode = memo(({ data }: NodeProps<TaskNodeData>) => {
  const Icon = statusIcons[data.status];

  return (
    <div
      onClick={data.onClick}
      className={cn(
        "px-4 py-3 rounded-lg border-2 min-w-[200px] cursor-pointer transition-all hover:shadow-md",
        statusColors[data.status]
      )}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3" />

      <div className="flex items-start gap-2">
        <Icon
          className={cn(
            "w-5 h-5 mt-0.5 shrink-0",
            data.status === "running" && "animate-spin",
            data.status === "completed" && "text-green-500",
            data.status === "failed" && "text-red-500"
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{data.label}</p>
          {data.agent && (
            <p className="text-xs text-muted-foreground mt-1">{data.agent}</p>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  );
});

TaskNode.displayName = "TaskNode";
```

**Step 3: Run type check**

Run: `npm run type-check`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/TaskGraph/
git commit -m "feat(observability): add TaskGraph visualization with React Flow"
```

---

### Task 5.2: Add Intervention Controls

**Files:**
- Create: `src/components/TaskControls/index.tsx`
- Modify: `src/store/chatStore.ts` (add pause/resume/redirect actions)

**Step 1: Create TaskControls component**

```typescript
// src/components/TaskControls/index.tsx
import { Pause, Play, SkipForward, StopCircle, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TaskControlsProps {
  status: "running" | "paused" | "pending" | "finished";
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSkip: () => void;
  onEdit: () => void;
  disabled?: boolean;
}

export function TaskControls({
  status,
  onPause,
  onResume,
  onStop,
  onSkip,
  onEdit,
  disabled = false,
}: TaskControlsProps) {
  const isRunning = status === "running";
  const isPaused = status === "paused";

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {isRunning && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onPause}
                disabled={disabled}
                className="h-8 w-8"
              >
                <Pause className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pause execution</TooltipContent>
          </Tooltip>
        )}

        {isPaused && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onResume}
                disabled={disabled}
                className="h-8 w-8"
              >
                <Play className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Resume execution</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onSkip}
              disabled={disabled || status === "finished"}
              className="h-8 w-8"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Skip current task</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              disabled={disabled || isRunning}
              className="h-8 w-8"
            >
              <Edit className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit task plan</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onStop}
              disabled={disabled || status === "finished"}
              className="h-8 w-8 text-destructive hover:text-destructive"
            >
              <StopCircle className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stop execution</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
```

**Step 2: Run type check**

Run: `npm run type-check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/TaskControls/
git commit -m "feat(observability): add TaskControls for pause/resume/skip/stop/edit"
```

---

## Phase 6: Error Handling & Recovery

### Task 6.1: Add Checkpointing to Orchestrator

**Files:**
- Modify: `backend/app/component/orchestrator.py`
- Create: `backend/app/component/checkpoint.py`
- Test: `backend/tests/test_checkpoint.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_checkpoint.py
import pytest
import json
import tempfile
from pathlib import Path
from app.component.checkpoint import CheckpointManager
from app.component.orchestrator import TaskGraph, TaskNode, TaskStatus

def test_checkpoint_saves_and_restores():
    with tempfile.TemporaryDirectory() as tmpdir:
        manager = CheckpointManager(Path(tmpdir))

        # Create a task graph
        graph = TaskGraph()
        graph.add_node(TaskNode(id="1", content="Task 1", agent="dev", status=TaskStatus.COMPLETED))
        graph.add_node(TaskNode(id="2", content="Task 2", agent="dev", depends_on=["1"], status=TaskStatus.RUNNING))
        graph.add_node(TaskNode(id="3", content="Task 3", agent="browser", depends_on=["1"]))

        # Save checkpoint
        checkpoint_id = manager.save(
            task_id="test-task-123",
            graph=graph,
            context={"user_input": "original question"}
        )

        # Restore checkpoint
        restored = manager.load(checkpoint_id)

        assert restored["graph"].nodes["1"].status == TaskStatus.COMPLETED
        assert restored["graph"].nodes["2"].status == TaskStatus.RUNNING
        assert restored["context"]["user_input"] == "original question"

def test_checkpoint_lists_by_task():
    with tempfile.TemporaryDirectory() as tmpdir:
        manager = CheckpointManager(Path(tmpdir))
        graph = TaskGraph()
        graph.add_node(TaskNode(id="1", content="Task 1", agent="dev"))

        manager.save("task-a", graph, {})
        manager.save("task-a", graph, {})
        manager.save("task-b", graph, {})

        task_a_checkpoints = manager.list_checkpoints("task-a")
        assert len(task_a_checkpoints) == 2
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_checkpoint.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# backend/app/component/checkpoint.py
import json
import uuid
from datetime import datetime
from pathlib import Path
from dataclasses import asdict
from typing import Dict, Any, List, Optional
from app.component.orchestrator import TaskGraph, TaskNode, TaskStatus

class CheckpointManager:
    def __init__(self, storage_path: Path):
        self.storage_path = storage_path
        self.storage_path.mkdir(parents=True, exist_ok=True)

    def save(self, task_id: str, graph: TaskGraph, context: Dict[str, Any]) -> str:
        checkpoint_id = f"{task_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"

        checkpoint_data = {
            "checkpoint_id": checkpoint_id,
            "task_id": task_id,
            "timestamp": datetime.now().isoformat(),
            "graph": self._serialize_graph(graph),
            "context": context,
        }

        checkpoint_file = self.storage_path / f"{checkpoint_id}.json"
        with open(checkpoint_file, "w") as f:
            json.dump(checkpoint_data, f, indent=2)

        return checkpoint_id

    def load(self, checkpoint_id: str) -> Dict[str, Any]:
        checkpoint_file = self.storage_path / f"{checkpoint_id}.json"

        with open(checkpoint_file, "r") as f:
            data = json.load(f)

        return {
            "checkpoint_id": data["checkpoint_id"],
            "task_id": data["task_id"],
            "timestamp": data["timestamp"],
            "graph": self._deserialize_graph(data["graph"]),
            "context": data["context"],
        }

    def list_checkpoints(self, task_id: str) -> List[str]:
        checkpoints = []
        for file in self.storage_path.glob(f"{task_id}_*.json"):
            checkpoints.append(file.stem)
        return sorted(checkpoints)

    def _serialize_graph(self, graph: TaskGraph) -> Dict:
        return {
            "nodes": {
                node_id: {
                    "id": node.id,
                    "content": node.content,
                    "agent": node.agent,
                    "depends_on": node.depends_on,
                    "status": node.status.value,
                    "result": node.result,
                }
                for node_id, node in graph.nodes.items()
            },
            "root": graph.root,
        }

    def _deserialize_graph(self, data: Dict) -> TaskGraph:
        graph = TaskGraph()
        graph.root = data["root"]

        for node_id, node_data in data["nodes"].items():
            graph.nodes[node_id] = TaskNode(
                id=node_data["id"],
                content=node_data["content"],
                agent=node_data["agent"],
                depends_on=node_data["depends_on"],
                status=TaskStatus(node_data["status"]),
                result=node_data["result"],
            )

        return graph
```

**Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_checkpoint.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/component/checkpoint.py backend/tests/test_checkpoint.py
git commit -m "feat(resilience): add CheckpointManager for task state persistence"
```

---

### Task 6.2: Add Error Recovery Flow

**Files:**
- Create: `backend/app/component/error_recovery.py`
- Test: `backend/tests/test_error_recovery.py`

**Step 1: Write the failing test**

```python
# backend/tests/test_error_recovery.py
import pytest
from app.component.error_recovery import ErrorRecovery, RecoveryStrategy, RecoveryResult

def test_error_recovery_suggests_retry():
    recovery = ErrorRecovery()

    result = recovery.analyze(
        error=Exception("Rate limit exceeded"),
        task_content="Generate a report",
        attempt_count=1
    )

    assert result.strategy == RecoveryStrategy.RETRY
    assert result.wait_seconds > 0

def test_error_recovery_suggests_fallback_after_retries():
    recovery = ErrorRecovery(max_retries=3)

    result = recovery.analyze(
        error=Exception("Rate limit exceeded"),
        task_content="Generate a report",
        attempt_count=4
    )

    assert result.strategy == RecoveryStrategy.FALLBACK
    assert "alternative" in result.user_message.lower()

def test_error_recovery_suggests_human_help_for_unknown():
    recovery = ErrorRecovery()

    result = recovery.analyze(
        error=Exception("Cannot access file: permission denied"),
        task_content="Read /etc/shadow",
        attempt_count=1
    )

    assert result.strategy == RecoveryStrategy.HUMAN_HELP
    assert result.question_for_user is not None
```

**Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_error_recovery.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# backend/app/component/error_recovery.py
from dataclasses import dataclass
from typing import Optional
from enum import Enum
import re

class RecoveryStrategy(str, Enum):
    RETRY = "retry"
    FALLBACK = "fallback"
    HUMAN_HELP = "human_help"
    ABORT = "abort"

@dataclass
class RecoveryResult:
    strategy: RecoveryStrategy
    user_message: str
    wait_seconds: int = 0
    question_for_user: Optional[str] = None
    suggested_action: Optional[str] = None

# Error patterns and their recovery strategies
ERROR_PATTERNS = [
    (r"rate limit|too many requests|429", RecoveryStrategy.RETRY, "Rate limit hit", 30),
    (r"timeout|timed out", RecoveryStrategy.RETRY, "Request timed out", 5),
    (r"connection|network|unreachable", RecoveryStrategy.RETRY, "Network issue", 10),
    (r"permission|access denied|forbidden|403", RecoveryStrategy.HUMAN_HELP, "Permission issue", 0),
    (r"not found|404|does not exist", RecoveryStrategy.HUMAN_HELP, "Resource not found", 0),
    (r"invalid|malformed|parse error", RecoveryStrategy.FALLBACK, "Invalid response", 0),
]

class ErrorRecovery:
    def __init__(self, max_retries: int = 3):
        self.max_retries = max_retries

    def analyze(
        self,
        error: Exception,
        task_content: str,
        attempt_count: int
    ) -> RecoveryResult:
        error_str = str(error).lower()

        # Match against known patterns
        for pattern, strategy, message, wait in ERROR_PATTERNS:
            if re.search(pattern, error_str):
                # Check if we've exceeded retries
                if strategy == RecoveryStrategy.RETRY and attempt_count > self.max_retries:
                    return RecoveryResult(
                        strategy=RecoveryStrategy.FALLBACK,
                        user_message=f"{message}. Tried {attempt_count} times. Trying alternative approach.",
                        wait_seconds=0,
                        suggested_action="Use fallback model or method"
                    )

                if strategy == RecoveryStrategy.HUMAN_HELP:
                    return RecoveryResult(
                        strategy=strategy,
                        user_message=f"{message}: {error}",
                        wait_seconds=0,
                        question_for_user=f"I encountered an issue: {error}. Can you help resolve this or provide an alternative?",
                    )

                return RecoveryResult(
                    strategy=strategy,
                    user_message=f"{message}. Retrying in {wait} seconds...",
                    wait_seconds=wait,
                )

        # Unknown error - ask for human help
        return RecoveryResult(
            strategy=RecoveryStrategy.HUMAN_HELP,
            user_message=f"Unexpected error: {error}",
            wait_seconds=0,
            question_for_user=f"I encountered an unexpected error while working on '{task_content[:50]}...': {error}. How would you like me to proceed?",
        )
```

**Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_error_recovery.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/component/error_recovery.py backend/tests/test_error_recovery.py
git commit -m "feat(resilience): add ErrorRecovery with pattern matching and recovery strategies"
```

---

## Integration Tasks

### Task INT.1: Wire Model Adapter into Agent Creation

**Files:**
- Modify: `backend/app/utils/agent.py:596-648` (agent_model function)

**Step 1: Import and use UniversalModelAdapter**

```python
# Add to imports at top of backend/app/utils/agent.py
from app.component.model_adapter import UniversalModelAdapter, ModelRegistry

# Modify agent_model function to use adapter when platform is openai-compatible
def agent_model(
    agent_name: str,
    system_message: str | BaseMessage,
    options: Chat,
    tools: list[FunctionTool | Callable] | None = None,
    # ... existing params ...
):
    # Check if using OpenAI-compatible model
    if options.model_platform == "openai-compatible-model":
        adapter = UniversalModelAdapter(
            endpoint_url=options.api_url,
            api_key=options.api_key,
            model_name=options.model_type
        )
        model = adapter.create_model(
            model_config_dict=model_config or None,
        )
    else:
        # Existing ModelFactory.create logic
        model = ModelFactory.create(
            model_platform=options.model_platform,
            model_type=options.model_type,
            api_key=options.api_key,
            url=options.api_url,
            model_config_dict=model_config or None,
        )

    return ListenChatAgent(
        # ... existing params with new model ...
    )
```

**Step 2: Run backend tests**

Run: `cd backend && uv run pytest -v`
Expected: All tests pass

**Step 3: Commit**

```bash
git add backend/app/utils/agent.py
git commit -m "feat(integration): wire UniversalModelAdapter into agent creation"
```

---

### Task INT.2: Wire Reasoning and Reflection into Agent Step

**Files:**
- Modify: `backend/app/utils/agent.py` (ListenChatAgent.step method)

This integrates the reasoning traces and reflection into the existing agent flow. The implementation depends on the specific agent architecture and should be done carefully to maintain backward compatibility.

**Step 1: Add reasoning wrapper to agent**

```python
# In ListenChatAgent.__init__, add:
self.reasoning = ReasoningWrapper()
self.reflection = ReflectionLoop(max_retries=2)
self.enable_reasoning = kwargs.get("enable_reasoning", False)

# In ListenChatAgent.step, wrap the call:
if self.enable_reasoning:
    enhanced_prompt = self.reasoning.enhance_prompt(input_message)
    response = super().step(enhanced_prompt, response_format)

    # Parse and emit reasoning traces
    parsed = self.reasoning.parse_response(response.msgs[0].content if response.msgs else "")
    for thought in parsed.thoughts:
        asyncio.create_task(
            task_lock.put_queue(
                ActionData(action=Action.reasoning_step, data={
                    "thought": thought.content,
                    "step_number": thought.step_number,
                    "agent_name": self.agent_name,
                })
            )
        )
else:
    response = super().step(input_message, response_format)
```

**Step 2: Run tests**

Run: `cd backend && uv run pytest -v`

**Step 3: Commit**

```bash
git add backend/app/utils/agent.py
git commit -m "feat(integration): wire reasoning traces into agent step method"
```

---

## Summary

This plan covers 6 phases with ~20 tasks total:

| Phase | Tasks | Focus |
|-------|-------|-------|
| 1. Foundation | 1.1-1.5 | Universal model adapter, z.ai, fallbacks, cost tracking |
| 2. Intelligence | 2.1-2.3 | Reasoning traces, self-reflection, streaming to frontend |
| 3. Coordination | 3.1-3.2 | Orchestrator, task graph, agent communication |
| 4. Memory | 4.1-4.2 | Organizations, memory storage with isolation |
| 5. Observability | 5.1-5.2 | Task graph visualization, intervention controls |
| 6. Resilience | 6.1-6.2 | Checkpointing, error recovery |
| Integration | INT.1-2 | Wiring components together |

Each task follows TDD: write failing test, implement, verify, commit.
