from typing import Optional
from sqlmodel import Field, Relationship
from sqlalchemy import JSON
from app.model.abstract.model import AbstractModel, DefaultTimes


class Organization(AbstractModel, DefaultTimes, table=True):
    __tablename__ = "organizations"

    id: int = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: Optional[str] = None
    knowledge_base_config: Optional[dict] = Field(default=None, sa_type=JSON)
    settings: Optional[dict] = Field(default=None, sa_type=JSON)
    owner_id: int = Field(foreign_key="user.id", index=True)


class OrganizationMembership(AbstractModel, DefaultTimes, table=True):
    __tablename__ = "organization_memberships"

    id: int = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    organization_id: int = Field(foreign_key="organizations.id", index=True)
    role: str = Field(default="member")  # owner, admin, member
