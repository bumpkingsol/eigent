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
