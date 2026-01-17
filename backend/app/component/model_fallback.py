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

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class ModelCallError(Exception):
    """All fallback models failed."""
    pass


@dataclass
class FallbackChain:
    """Chain of models to try in order, with automatic failover.

    When a model fails (rate limit, timeout, etc.), the next model in the
    chain is tried automatically.
    """

    models: List[Dict[str, str]]
    registry: Any = None
    last_used_provider: Optional[str] = field(default=None, init=False)
    last_error: Optional[Exception] = field(default=None, init=False)

    def _get_adapter(self, provider: str, model: str):
        """Get adapter for a provider/model pair."""
        if self.registry:
            return self.registry.get_adapter(provider, model)
        # For testing without registry
        raise NotImplementedError("Registry required")

    def call(self, prompt: str, **kwargs) -> Any:
        """Call the model chain, trying each model in order until one succeeds."""
        errors = []

        for model_config in self.models:
            provider = model_config["provider"]
            model = model_config["model"]

            try:
                adapter = self._get_adapter(provider, model)
                agent = adapter.create_model(**kwargs)
                response = agent.step(prompt)
                self.last_used_provider = provider

                if hasattr(response, 'msgs') and response.msgs:
                    return response.msgs[0]
                return response

            except Exception as e:
                logger.warning(f"Model {provider}/{model} failed: {e}")
                errors.append((provider, model, e))
                self.last_error = e
                continue

        error_summary = "; ".join([f"{p}/{m}: {e}" for p, m, e in errors])
        raise ModelCallError(f"All models failed: {error_summary}")
