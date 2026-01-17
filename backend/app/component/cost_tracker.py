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

from dataclasses import dataclass
from typing import Dict, List, Optional
from collections import defaultdict


@dataclass
class TokenUsage:
    """Record of token usage for a single model call."""

    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    org_id: Optional[str] = None
    task_id: Optional[str] = None


class CostTracker:
    """Tracks token usage and costs across model calls.

    Supports filtering by organization and task for multi-tenant cost tracking.
    """

    def __init__(self):
        self._records: List[TokenUsage] = []

    def record(self, usage: TokenUsage):
        """Record a token usage event."""
        self._records.append(usage)

    def get_summary(
        self, org_id: Optional[str] = None, task_id: Optional[str] = None
    ) -> Dict:
        """Get cost summary, optionally filtered by org or task."""
        filtered = self._records
        if org_id:
            filtered = [r for r in filtered if r.org_id == org_id]
        if task_id:
            filtered = [r for r in filtered if r.task_id == task_id]

        by_provider = defaultdict(
            lambda: {"cost_usd": 0, "input_tokens": 0, "output_tokens": 0}
        )
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

    def clear(self):
        """Clear all recorded usage."""
        self._records.clear()
