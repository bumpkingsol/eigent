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
            # Handle potential different response structures from the agent
            if hasattr(response, "msgs") and response.msgs:
                feedback = response.msgs[0].content
            else:
                # Fallback if structure is different, though tests assume msgs[0].content
                # Based on existing codebase patterns, agent.step returns a ChatMessage structure
                feedback = ""

            # The test mocks it as response.msgs[0].content so I'll stick to that
            # but I should make sure my implementation matches the mock exactly first.
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
