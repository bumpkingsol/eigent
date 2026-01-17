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
from unittest.mock import Mock, patch
from app.component.model_fallback import FallbackChain, ModelCallError


def test_fallback_tries_next_on_failure():
    chain = FallbackChain([
        {"provider": "primary", "model": "gpt-4"},
        {"provider": "fallback", "model": "glm-4"},
    ])

    # Mock: primary fails, fallback succeeds
    primary_adapter = Mock()
    primary_adapter.create_model.return_value.step.side_effect = Exception("Rate limit")

    fallback_adapter = Mock()
    fallback_response = Mock()
    fallback_response.msgs = [Mock(content="Success")]
    fallback_adapter.create_model.return_value.step.return_value = fallback_response

    with patch.object(chain, '_get_adapter', side_effect=[primary_adapter, fallback_adapter]):
        result = chain.call("test prompt")

    assert result.content == "Success"
    assert chain.last_used_provider == "fallback"


def test_fallback_raises_after_all_fail():
    chain = FallbackChain([
        {"provider": "a", "model": "m1"},
        {"provider": "b", "model": "m2"},
    ])

    failing_adapter = Mock()
    failing_adapter.create_model.return_value.step.side_effect = Exception("Failed")

    with patch.object(chain, '_get_adapter', return_value=failing_adapter):
        with pytest.raises(ModelCallError, match="All models failed"):
            chain.call("test prompt")
