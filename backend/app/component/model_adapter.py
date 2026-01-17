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
from urllib.parse import urlparse

from camel.models import ModelFactory
from camel.types import ModelPlatformType


@dataclass
class ModelCapabilities:
    """Tracks the capabilities of a model."""

    supports_function_calling: bool = True
    supports_vision: bool = False
    supports_streaming: bool = True
    max_context_length: int = 128000


@dataclass
class UniversalModelAdapter:
    """Adapter for OpenAI-compatible model APIs.

    This adapter wraps CAMEL-AI's ModelFactory and adds capability tracking,
    enabling Eigent to work with any OpenAI-compatible API.
    """

    endpoint_url: str
    api_key: str
    model_name: str
    capabilities: ModelCapabilities = None

    def __post_init__(self):
        parsed = urlparse(self.endpoint_url)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError(f"Invalid endpoint: {self.endpoint_url}")
        if self.capabilities is None:
            self.capabilities = ModelCapabilities()

    def create_model(self, **kwargs):
        """Create CAMEL model instance."""
        return ModelFactory.create(
            model_platform=ModelPlatformType.OPENAI_COMPATIBLE_MODEL,
            model_type=self.model_name,
            api_key=self.api_key,
            url=self.endpoint_url,
            **kwargs
        )


class ModelRegistry:
    """Registry for managing model adapters by provider and model name.

    Allows registering multiple models per provider and retrieving
    adapters by provider+model combination.
    """

    def __init__(self):
        self._adapters: Dict[str, Dict[str, UniversalModelAdapter]] = {}

    def register(
        self,
        provider_id: str,
        endpoint_url: str,
        api_key: str,
        models: List[str],
        capabilities: Optional[ModelCapabilities] = None
    ):
        """Register models for a provider."""
        if provider_id not in self._adapters:
            self._adapters[provider_id] = {}

        for model in models:
            self._adapters[provider_id][model] = UniversalModelAdapter(
                endpoint_url=endpoint_url,
                api_key=api_key,
                model_name=model,
                capabilities=capabilities or ModelCapabilities()
            )

    def get_adapter(
        self, provider_id: str, model_name: str
    ) -> Optional[UniversalModelAdapter]:
        """Get adapter for a specific provider and model."""
        return self._adapters.get(provider_id, {}).get(model_name)

    def list_providers(self) -> List[str]:
        """List all registered providers."""
        return list(self._adapters.keys())

    def list_models(self, provider_id: str) -> List[str]:
        """List all models for a provider."""
        return list(self._adapters.get(provider_id, {}).keys())
