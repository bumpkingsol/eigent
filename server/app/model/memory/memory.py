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

from enum import Enum
from typing import Optional

from sqlalchemy import JSON
from sqlmodel import Field

from app.model.abstract.model import AbstractModel, DefaultTimes


class MemoryType(str, Enum):
    """Types of memories that can be stored.

    Attributes:
        PREFERENCE: User or org preferences (coding style, communication).
        TASK_HISTORY: Records of past tasks and their outcomes.
        KNOWLEDGE: Domain knowledge and learned information.
        FEEDBACK: Corrections and guidance from users.
    """

    PREFERENCE = "preference"
    TASK_HISTORY = "task_history"
    KNOWLEDGE = "knowledge"
    FEEDBACK = "feedback"


class Memory(AbstractModel, DefaultTimes, table=True):
    """Memory storage with organization-level isolation.

    Memories are scoped to a user and optionally to an organization.
    When organization_id is set, the memory is isolated to that org context.
    Personal memories (org_id=None) are available across all contexts.

    Attributes:
        id: Primary key identifier.
        user_id: Foreign key to the user who owns this memory.
        organization_id: Optional foreign key for org-scoped memories.
        memory_type: Category of this memory (preference, knowledge, etc).
        content: The actual memory content as text.
        extra_data: Additional structured data as JSON.
    """

    __tablename__ = "memories"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    organization_id: Optional[int] = Field(
        default=None, foreign_key="organizations.id", index=True, nullable=True
    )
    memory_type: MemoryType = Field(index=True)
    content: str
    extra_data: Optional[dict] = Field(default=None, sa_type=JSON)


class UserPreference(AbstractModel, DefaultTimes, table=True):
    """User-level preferences that apply across all organizations.

    These are personal preferences that follow the user regardless of
    which organization context they are working in.

    Attributes:
        id: Primary key identifier.
        user_id: Foreign key to the user (unique constraint).
        coding_style: Preferences for code formatting, languages, etc.
        communication_preferences: How the user prefers to receive info.
        tool_preferences: Preferred tools and configurations.
    """

    __tablename__ = "user_preferences"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True, unique=True)
    coding_style: Optional[dict] = Field(default=None, sa_type=JSON)
    communication_preferences: Optional[dict] = Field(default=None, sa_type=JSON)
    tool_preferences: Optional[dict] = Field(default=None, sa_type=JSON)
