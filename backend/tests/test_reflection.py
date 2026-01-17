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
