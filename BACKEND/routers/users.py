"""
Users router.
Handles authenticated user profile reads and updates.

Routes:
    GET  /users/me         → return current user
    PATCH /users/me        → update full_name, phone, avatar_url
    PUT  /users/me/preferences → update home area + mode preference
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User, UserPreference
from schemas import UserResponse, UserUpdate, SuccessResponse
from dependencies import get_current_user

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    """Return the current authenticated user."""
    return user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update mutable profile fields."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return user

    for field, value in updates.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)
    return user


@router.put("/me/preferences", response_model=SuccessResponse)
async def update_preferences(
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upsert user preferences (home location, preferred mode, etc.).
    Body accepts any subset of: home_lat, home_lon, home_address, pune_area, preferred_mode.
    """
    result = await db.execute(
        select(UserPreference).where(UserPreference.user_id == user.id)
    )
    prefs = result.scalar_one_or_none()

    if not prefs:
        prefs = UserPreference(user_id=user.id)
        db.add(prefs)

    allowed = {"home_lat", "home_lon", "home_address", "pune_area", "preferred_mode"}
    for k, v in body.items():
        if k in allowed:
            setattr(prefs, k, v)

    await db.commit()
    return SuccessResponse(message="Preferences updated")
