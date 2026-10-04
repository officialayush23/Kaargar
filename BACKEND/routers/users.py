"""
Users router.
Handles authenticated user profile reads and updates.

Routes:
    GET  /users/me         → return current user
    PATCH /users/me        → update full_name, phone, avatar_url
    PUT  /users/me/preferences → update home area + mode preference
    DELETE /users/me       → delete account (App Store 5.1.1(v) / Play policy)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User, UserPreference
from schemas import UserResponse, UserUpdate, SuccessResponse
from dependencies import get_current_user, user_response_with_prefs

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def get_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current authenticated user, with UI preferences attached."""
    return await user_response_with_prefs(db, user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update mutable profile fields."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return await user_response_with_prefs(db, user)

    # A changed number is an unverified number.
    if "phone" in updates and updates["phone"] != user.phone:
        user.phone_verified = False
    for field, value in updates.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)
    return await user_response_with_prefs(db, user)


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

    # UI preferences are validated against a fixed set rather than allow-listed
    # by key alone. This endpoint takes an untyped `dict`, so without this a
    # client could write any string into `language` and every subsequent
    # translate call would ask Sarvam for a language that doesn't exist.
    if "language" in body:
        lang = str(body["language"]).strip().lower()
        if lang not in {"en", "hi", "mr"}:
            raise HTTPException(400, "Unsupported language")
        prefs.language = lang

    if "active_mode" in body:
        mode = str(body["active_mode"]).strip().lower()
        if mode not in {"customer", "worker"}:
            raise HTTPException(400, "Invalid mode")
        prefs.active_mode = mode

    await db.commit()
    return SuccessResponse(message="Preferences updated")


ACTIVE_JOB_STATUSES = (
    "requested", "searching", "scheduled", "confirmed", "worker_assigned",
    "assigned", "en_route", "arrived", "started", "awaiting_approval", "approved", "disputed",
)


@router.delete("/me", response_model=SuccessResponse)
async def delete_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete the caller's account. Required in-app by Apple (5.1.1(v)) and Google Play.

    Design:
      * Refuses while any job is live (as customer OR worker) — deleting mid-job
        would strand a worker at a door or a customer with money in escrow.
      * ANONYMISES rather than hard-deletes the users row: jobs, payments,
        ratings and payouts reference it and must be kept for tax/dispute
        records. Personal data (name, email, phone, avatar, addresses) is erased.
      * Removes the Supabase auth identity so the email can sign up fresh and
        old tokens stop resolving (is_active=False also blocks them immediately
        in get_current_user, even if the auth call fails).
    """
    import logging
    from sqlalchemy import or_, delete as sa_delete
    from models import Job, WorkerProfile, UserAddress, Payout

    wp = (await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))).scalar_one_or_none()
    conds = [Job.user_id == user.id]
    if wp:
        conds.append(Job.worker_id == wp.id)
    live = (await db.execute(
        select(Job.id).where(or_(*conds), Job.status.in_(ACTIVE_JOB_STATUSES)).limit(1)
    )).scalar_one_or_none()
    if live:
        raise HTTPException(status_code=409, detail="Finish or cancel your active bookings before deleting your account.")

    # A worker still owed money keeps their payout details until it's paid —
    # otherwise admin has nowhere to send it.
    if wp:
        owed = (await db.execute(
            select(Payout.id).where(Payout.worker_id == wp.id, Payout.status.in_(("pending", "processing"))).limit(1)
        )).scalar_one_or_none()
        if owed:
            raise HTTPException(status_code=409, detail="You have a payout on the way. You can delete your account once it has been paid.")

    uid = str(user.id)
    user.email = f"deleted+{uid}@deleted.kaargar.invalid"
    user.full_name = None
    user.phone = None
    user.phone_verified = False
    user.email_verified = False
    user.avatar_url = None
    user.is_active = False
    await db.execute(sa_delete(UserAddress).where(UserAddress.user_id == user.id))
    if wp:
        wp.status = "offline"
        wp.is_instant_available = False
        wp.is_discovery_available = False
        for f in ("bio", "payout_upi_id", "payout_bank_account", "payout_ifsc", "payout_account_name"):
            if hasattr(wp, f):
                setattr(wp, f, None)
    await db.commit()

    try:
        import asyncio
        from services.storage import supabase as sb_admin
        await asyncio.to_thread(sb_admin.auth.admin.delete_user, uid)
    except Exception:  # noqa: BLE001 — account is already deactivated; log and move on
        logging.getLogger(__name__).exception("Supabase auth delete failed for %s", uid)

    return SuccessResponse(message="Account deleted")
