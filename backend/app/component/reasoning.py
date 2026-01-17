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
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class ThoughtStep:
    """A single step in the agent's reasoning chain."""

    content: str
    step_number: int


@dataclass
class ReasoningResult:
    """Parsed reasoning result from agent response."""

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
    """Wraps agent calls with chain-of-thought prompting.

    Enhances prompts to request step-by-step reasoning and parses
    the resulting thoughts and actions from responses.
    """

    def __init__(self):
        self.thought_pattern = re.compile(r'<thought>(.*?)</thought>', re.DOTALL)
        self.action_pattern = re.compile(r'<action>(.*?)</action>', re.DOTALL)

    def enhance_prompt(self, prompt: str) -> str:
        """Add reasoning instructions to a prompt."""
        return prompt + REASONING_PROMPT_SUFFIX

    def parse_response(self, response: str) -> ReasoningResult:
        """Extract thoughts and actions from agent response."""
        thoughts = self.thought_pattern.findall(response)
        actions = self.action_pattern.findall(response)

        return ReasoningResult(
            thoughts=[
                ThoughtStep(content=t.strip(), step_number=i + 1)
                for i, t in enumerate(thoughts)
            ],
            action=actions[0].strip() if actions else None,
            raw_response=response
        )
