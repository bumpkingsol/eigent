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

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from app.component.auth import Auth, auth_must
from app.component.database import session
from app.model.memory.memory import Memory, MemoryType, UserPreference
from utils import traceroot_wrapper as traceroot

logger = traceroot.get_logger("server_memory_controller")

router = APIRouter(prefix="/memory", tags=["Memory Management"])


class MemoryCreate(BaseModel):
    """Input model for creating a memory."""

    organization_id: Optional[int] = None
    memory_type: MemoryType
    content: str
    extra_data: Optional[dict] = None


class MemoryOut(BaseModel):
    """Output model for memory responses."""

    id: int
    memory_type: MemoryType
    content: str
    extra_data: Optional[dict]
    organization_id: Optional[int]

    class Config:
        from_attributes = True


class UserPreferenceUpdate(BaseModel):
    """Input model for updating user preferences."""

    coding_style: Optional[dict] = None
    communication_preferences: Optional[dict] = None
    tool_preferences: Optional[dict] = None


class UserPreferenceOut(BaseModel):
    """Output model for user preferences."""

    id: int
    user_id: int
    coding_style: Optional[dict]
    communication_preferences: Optional[dict]
    tool_preferences: Optional[dict]

    class Config:
        from_attributes = True


@router.post("/", response_model=MemoryOut)
@traceroot.trace()
async def create_memory(
    data: MemoryCreate,
    auth: Auth = Depends(auth_must),
    s: Session = Depends(session),
):
    """Create a new memory entry.

    Memories are scoped to the authenticated user. If organization_id is
    provided, the memory is isolated to that organization's context.
    """
    user_id = auth.user.id

    try:
        memory = Memory(
            user_id=user_id,
            organization_id=data.organization_id,
            memory_type=data.memory_type,
            content=data.content,
            extra_data=data.extra_data,
        )
        memory.save(s)
        logger.info(
            "Memory created",
            extra={
                "user_id": user_id,
                "memory_id": memory.id,
                "memory_type": data.memory_type.value,
                "org_id": data.organization_id,
            },
        )
        return memory
    except Exception as e:
        logger.error(
            "Memory creation failed",
            extra={"user_id": user_id, "error": str(e)},
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Failed to create memory")


@router.get("/", response_model=List[MemoryOut])
@traceroot.trace()
async def list_memories(
    organization_id: Optional[int] = Query(None, description="Filter by organization"),
    memory_type: Optional[MemoryType] = Query(None, description="Filter by memory type"),
    auth: Auth = Depends(auth_must),
    s: Session = Depends(session),
):
    """List memories for the authenticated user.

    Results are scoped to the user. When organization_id is provided,
    only memories for that organization are returned (org isolation).
    """
    user_id = auth.user.id

    stmt = select(Memory).where(Memory.user_id == user_id, Memory.no_delete())

    if organization_id is not None:
        stmt = stmt.where(Memory.organization_id == organization_id)
    if memory_type is not None:
        stmt = stmt.where(Memory.memory_type == memory_type)

    memories = s.exec(stmt).all()
    logger.debug(
        "Memories listed",
        extra={
            "user_id": user_id,
            "count": len(memories),
            "org_filter": organization_id,
            "type_filter": memory_type.value if memory_type else None,
        },
    )
    return memories


@router.delete("/{memory_id}")
@traceroot.trace()
async def delete_memory(
    memory_id: int,
    auth: Auth = Depends(auth_must),
    s: Session = Depends(session),
):
    """Delete a memory entry."""
    user_id = auth.user.id

    memory = s.exec(
        select(Memory).where(
            Memory.id == memory_id, Memory.user_id == user_id, Memory.no_delete()
        )
    ).one_or_none()

    if not memory:
        logger.warning(
            "Memory not found for deletion",
            extra={"user_id": user_id, "memory_id": memory_id},
        )
        raise HTTPException(status_code=404, detail="Memory not found")

    try:
        memory.delete(s)
        logger.info(
            "Memory deleted", extra={"user_id": user_id, "memory_id": memory_id}
        )
        return {"success": True}
    except Exception as e:
        logger.error(
            "Memory deletion failed",
            extra={"user_id": user_id, "memory_id": memory_id, "error": str(e)},
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Failed to delete memory")


@router.get("/preferences", response_model=UserPreferenceOut)
@traceroot.trace()
async def get_preferences(
    auth: Auth = Depends(auth_must),
    s: Session = Depends(session),
):
    """Get user preferences.

    Returns the user's global preferences that apply across all organizations.
    Creates a default preference record if none exists.
    """
    user_id = auth.user.id

    prefs = s.exec(
        select(UserPreference).where(UserPreference.user_id == user_id)
    ).first()

    if not prefs:
        prefs = UserPreference(user_id=user_id)
        prefs.save(s)
        logger.info(
            "Default user preferences created", extra={"user_id": user_id}
        )

    return prefs


@router.put("/preferences", response_model=UserPreferenceOut)
@traceroot.trace()
async def update_preferences(
    data: UserPreferenceUpdate,
    auth: Auth = Depends(auth_must),
    s: Session = Depends(session),
):
    """Update user preferences.

    Only provided fields are updated; others are left unchanged.
    """
    user_id = auth.user.id

    prefs = s.exec(
        select(UserPreference).where(UserPreference.user_id == user_id)
    ).first()

    if not prefs:
        prefs = UserPreference(user_id=user_id)

    if data.coding_style is not None:
        prefs.coding_style = data.coding_style
    if data.communication_preferences is not None:
        prefs.communication_preferences = data.communication_preferences
    if data.tool_preferences is not None:
        prefs.tool_preferences = data.tool_preferences

    try:
        prefs.save(s)
        logger.info("User preferences updated", extra={"user_id": user_id})
        return prefs
    except Exception as e:
        logger.error(
            "Preference update failed",
            extra={"user_id": user_id, "error": str(e)},
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Failed to update preferences")
