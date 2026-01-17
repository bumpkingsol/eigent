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


class OrgRole(str, Enum):
    """Roles available for organization membership.

    Attributes:
        OWNER: Full control over the organization.
        ADMIN: Can manage members and settings.
        MEMBER: Standard access to organization resources.
    """

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class Organization(AbstractModel, DefaultTimes, table=True):
    """Organization model for multi-tenant support.

    Organizations group users and provide isolated contexts for memory,
    knowledge bases, and settings. A user can belong to multiple organizations.

    Attributes:
        id: Primary key identifier.
        name: Display name of the organization.
        description: Optional description of the organization.
        knowledge_base_config: JSON configuration for the org's knowledge base.
        settings: JSON blob for organization-specific settings.
        owner_id: Foreign key to the user who owns this organization.
    """

    __tablename__ = "organizations"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: Optional[str] = None
    knowledge_base_config: Optional[dict] = Field(default=None, sa_type=JSON)
    settings: Optional[dict] = Field(default=None, sa_type=JSON)
    owner_id: int = Field(foreign_key="user.id", index=True)


class OrganizationMembership(AbstractModel, DefaultTimes, table=True):
    """Membership linking users to organizations with specific roles.

    Defines the many-to-many relationship between users and organizations,
    with an associated role determining access levels.

    Attributes:
        id: Primary key identifier.
        user_id: Foreign key to the user.
        organization_id: Foreign key to the organization.
        role: The user's role within this organization.
    """

    __tablename__ = "organization_memberships"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    organization_id: int = Field(foreign_key="organizations.id", index=True)
    role: OrgRole = Field(default=OrgRole.MEMBER)
