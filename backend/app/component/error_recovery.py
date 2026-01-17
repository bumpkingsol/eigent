# ========= Copyright 2025 @ EIGENT.AI. All Rights Reserved. =========
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ========= Copyright 2025 @ EIGENT.AI. All Rights Reserved. =========

import re
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class RecoveryStrategy(str, Enum):
    """Strategies for recovering from errors.

    Attributes:
        RETRY: Try the same operation again after a delay.
        FALLBACK: Use an alternative approach or model.
        HUMAN_HELP: Request human intervention.
        ABORT: Stop execution entirely.
    """

    RETRY = "retry"
    FALLBACK = "fallback"
    HUMAN_HELP = "human_help"
    ABORT = "abort"


@dataclass
class RecoveryResult:
    """Result of error analysis with recommended recovery action.

    Attributes:
        strategy: Recommended recovery strategy.
        user_message: Human-readable explanation of what happened.
        wait_seconds: Seconds to wait before retrying (if RETRY).
        question_for_user: Question to ask the user (if HUMAN_HELP).
        suggested_action: Specific action recommendation.
    """

    strategy: RecoveryStrategy
    user_message: str
    wait_seconds: int = 0
    question_for_user: Optional[str] = None
    suggested_action: Optional[str] = None


# Error patterns and their recovery strategies
# Format: (pattern, strategy, message, wait_seconds)
ERROR_PATTERNS = [
    (r"rate limit|too many requests|429", RecoveryStrategy.RETRY, "Rate limit hit", 30),
    (r"timeout|timed out", RecoveryStrategy.RETRY, "Request timed out", 5),
    (r"connection|network|unreachable", RecoveryStrategy.RETRY, "Network issue", 10),
    (
        r"permission|access denied|forbidden|403",
        RecoveryStrategy.HUMAN_HELP,
        "Permission issue",
        0,
    ),
    (
        r"not found|404|does not exist",
        RecoveryStrategy.HUMAN_HELP,
        "Resource not found",
        0,
    ),
    (
        r"invalid|malformed|parse error",
        RecoveryStrategy.FALLBACK,
        "Invalid response",
        0,
    ),
]


class ErrorRecovery:
    """Analyzes errors and recommends recovery strategies.

    Uses pattern matching to identify common error types and suggest
    appropriate recovery actions. Supports retry limits and graceful
    degradation to fallback models or human assistance.

    Attributes:
        max_retries: Maximum retry attempts before switching to fallback.
    """

    def __init__(self, max_retries: int = 3):
        """Initialize error recovery handler.

        Args:
            max_retries: Maximum retry attempts before suggesting fallback.
        """
        self.max_retries = max_retries

    def analyze(
        self,
        error: Exception,
        task_content: str,
        attempt_count: int,
    ) -> RecoveryResult:
        """Analyze an error and recommend a recovery strategy.

        Args:
            error: The exception that occurred.
            task_content: Description of what was being attempted.
            attempt_count: Number of attempts made so far.

        Returns:
            RecoveryResult with recommended strategy and details.
        """
        error_str = str(error).lower()

        # Match against known patterns
        for pattern, strategy, message, wait in ERROR_PATTERNS:
            if re.search(pattern, error_str):
                # Check if we've exceeded retries
                if strategy == RecoveryStrategy.RETRY and attempt_count > self.max_retries:
                    return RecoveryResult(
                        strategy=RecoveryStrategy.FALLBACK,
                        user_message=(
                            f"{message}. Tried {attempt_count} times. "
                            "Trying alternative approach."
                        ),
                        wait_seconds=0,
                        suggested_action="Use fallback model or method",
                    )

                if strategy == RecoveryStrategy.HUMAN_HELP:
                    return RecoveryResult(
                        strategy=strategy,
                        user_message=f"{message}: {error}",
                        wait_seconds=0,
                        question_for_user=(
                            f"I encountered an issue: {error}. "
                            "Can you help resolve this or provide an alternative?"
                        ),
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
            question_for_user=(
                f"I encountered an unexpected error while working on "
                f"'{task_content[:50]}...': {error}. How would you like me to proceed?"
            ),
        )
