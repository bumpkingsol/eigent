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

import pytest
from app.component.error_recovery import ErrorRecovery, RecoveryStrategy


def test_error_recovery_suggests_retry():
    recovery = ErrorRecovery()

    result = recovery.analyze(
        error=Exception("Rate limit exceeded"),
        task_content="Generate a report",
        attempt_count=1,
    )

    assert result.strategy == RecoveryStrategy.RETRY
    assert result.wait_seconds > 0


def test_error_recovery_suggests_fallback_after_retries():
    recovery = ErrorRecovery(max_retries=3)

    result = recovery.analyze(
        error=Exception("Rate limit exceeded"),
        task_content="Generate a report",
        attempt_count=4,
    )

    assert result.strategy == RecoveryStrategy.FALLBACK
    assert "alternative" in result.user_message.lower()


def test_error_recovery_suggests_human_help_for_unknown():
    recovery = ErrorRecovery()

    result = recovery.analyze(
        error=Exception("Cannot access file: permission denied"),
        task_content="Read /etc/shadow",
        attempt_count=1,
    )

    assert result.strategy == RecoveryStrategy.HUMAN_HELP
    assert result.question_for_user is not None
