import pytest
from unittest.mock import Mock
from app.component.reflection import ReflectionLoop, ReflectionResult


def test_reflection_loop_approves_good_result():
    loop = ReflectionLoop()
    mock_agent = Mock()
    mock_agent.step.return_value = Mock(msgs=[Mock(content="The result looks correct and complete.")])

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

    mock_execute = Mock(side_effect=["4 (2 plus 2 equals 4)"])

    result = loop.reflect(
        agent=mock_agent,
        task="Calculate 2+2",
        result="4",
        execute_fn=mock_execute,
    )

    assert result.approved is True
    assert result.retry_count == 1
    assert result.final_result == "4 (2 plus 2 equals 4)"


def test_reflection_loop_fails_after_max_retries():
    loop = ReflectionLoop(max_retries=2)
    mock_agent = Mock()

    # Always needs improvement
    mock_agent.step.return_value = Mock(msgs=[Mock(content="NEEDS_IMPROVEMENT: Still wrong")])

    mock_execute = Mock(side_effect=["Attempt 1", "Attempt 2"])

    result = loop.reflect(agent=mock_agent, task="Task", result="Initial", execute_fn=mock_execute)

    assert result.approved is False
    assert result.retry_count == 2
    assert result.final_result == "Attempt 2"
    assert len(result.feedback_history) == 3  # Initial + 2 retries = 3 feedback checks?
    # Logic trace:
    # retry 0: feedback "NEEDS...", history append, execute_fn -> "Attempt 1"
    # retry 1: feedback "NEEDS...", history append, execute_fn -> "Attempt 2"
    # retry 2: feedback "NEEDS...", history append, if execute_fn and retry < max_retries (2<2 False) -> Loop ends
    # So feedback history should have 3 entries.


def test_reflection_loop_returns_early_without_execute_fn():
    loop = ReflectionLoop(max_retries=3)
    mock_agent = Mock()

    # Needs improvement
    mock_agent.step.return_value = Mock(msgs=[Mock(content="NEEDS_IMPROVEMENT: Wrong")])

    # No execute_fn provided
    result = loop.reflect(agent=mock_agent, task="Task", result="Initial", execute_fn=None)

    assert result.approved is False
    # Should stop after the first check because we can't improve it
    assert result.retry_count == 0
    assert len(result.feedback_history) == 1
