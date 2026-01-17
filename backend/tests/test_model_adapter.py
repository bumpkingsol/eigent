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
from app.component.model_adapter import UniversalModelAdapter, ModelCapabilities


def test_adapter_creates_openai_compatible_model():
    adapter = UniversalModelAdapter(
        endpoint_url="https://api.z.ai/api/paas/v4/",
        api_key="test-key",
        model_name="glm-4"
    )
    assert adapter.endpoint_url == "https://api.z.ai/api/paas/v4/"
    assert adapter.capabilities.supports_function_calling is True


def test_adapter_validates_endpoint():
    with pytest.raises(ValueError, match="Invalid endpoint"):
        UniversalModelAdapter(
            endpoint_url="not-a-url",
            api_key="test-key",
            model_name="test"
        )


def test_model_registry_stores_adapters():
    from app.component.model_adapter import ModelRegistry

    registry = ModelRegistry()
    registry.register(
        provider_id="z.ai",
        endpoint_url="https://api.z.ai/api/paas/v4/",
        api_key="test-key",
        models=["glm-4", "glm-4-plus"]
    )

    adapter = registry.get_adapter("z.ai", "glm-4")
    assert adapter is not None
    assert adapter.model_name == "glm-4"


def test_registry_returns_none_for_unknown():
    from app.component.model_adapter import ModelRegistry

    registry = ModelRegistry()
    adapter = registry.get_adapter("unknown", "model")
    assert adapter is None
