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
