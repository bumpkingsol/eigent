from dataclasses import dataclass, field
from typing import Optional, Callable, Any, List


@dataclass
class ReflectionResult:
    """Result of a reflection loop.

    Attributes:
        approved (bool): Whether the result was approved by the agent.
        retry_count (int): Number of retries performed.
        final_result (Any): The final result after potential improvements.
        feedback_history (List[str]): History of feedback received from the agent.
    """

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
    """Manages a reflection loop where an agent evaluates and improves a result.

    The loop continues until the agent approves the result or the maximum number
    of retries is reached.
    """

    def __init__(self, max_retries: int = 3):
        """Initialize the ReflectionLoop.

        Args:
            max_retries (int): Maximum number of times to retry improvement. Defaults to 3.
        """
        self.max_retries = max_retries

    def reflect(
        self,
        agent: Any,
        task: str,
        result: Any,
        execute_fn: Optional[Callable[[str], Any]] = None,
    ) -> ReflectionResult:
        """Execute the reflection loop.

        Args:
            agent (Any): The agent instance to evaluate the result.
            task (str): The task description.
            result (Any): The initial result to evaluate.
            execute_fn (Optional[Callable[[str], Any]]): Function to execute if improvement is needed.
                Takes the feedback string as input and returns a new result.

        Returns:
            ReflectionResult: The outcome of the reflection process.
        """
        current_result = result
        feedback_history = []

        for retry in range(self.max_retries + 1):
            prompt = REFLECTION_PROMPT.format(task=task, result=current_result)
            response = agent.step(prompt)

            # Extract feedback handling different response structures
            feedback = ""
            if hasattr(response, "msgs") and response.msgs:
                feedback = response.msgs[0].content

            if "NEEDS_IMPROVEMENT:" not in feedback:
                return ReflectionResult(
                    approved=True,
                    retry_count=retry,
                    final_result=current_result,
                    feedback_history=feedback_history,
                )

            feedback_history.append(feedback)

            # If we have no way to improve the result (no execute_fn), we should stop immediately
            # after the first rejection rather than retrying futilely.
            if not execute_fn:
                return ReflectionResult(
                    approved=False,
                    retry_count=retry,
                    final_result=current_result,
                    feedback_history=feedback_history,
                )

            if retry < self.max_retries:
                current_result = execute_fn(feedback)

        return ReflectionResult(
            approved=False,
            retry_count=self.max_retries,
            final_result=current_result,
            feedback_history=feedback_history,
        )
