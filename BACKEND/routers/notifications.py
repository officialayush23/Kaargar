from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from database import get_db
from models import User, Notification, DeviceToken
from schemas import NotificationResponse, SuccessResponse, DeviceTokenRegister
from dependencies import get_current_user

router = APIRouter()


@router.get("", response_model=list[NotificationResponse])
async def list_notifications(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.patch("/read-all", response_model=SuccessResponse)
async def mark_all_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone
    await db.execute(
        Notification.__table__.update()
        .where(Notification.user_id == user.id)
        .where(Notification.is_read == False)
        .values(is_read=True, read_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return SuccessResponse(message="All marked as read")


@router.patch("/{notif_id}/read", response_model=SuccessResponse)
async def mark_read(
    notif_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone
    result = await db.execute(
        select(Notification)
        .where(Notification.id == notif_id, Notification.user_id == user.id)
    )
    n = result.scalar_one_or_none()
    if not n:
        from fastapi import HTTPException
        raise HTTPException(404)
    n.is_read = True
    n.read_at = datetime.now(timezone.utc)
    await db.commit()
    return SuccessResponse(message="Marked as read")


# ── PUSH DEVICE TOKENS ────────────────────────────────────────────────────────

@router.post("/device-token", response_model=SuccessResponse)
async def register_device_token(
    body: DeviceTokenRegister,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Register (or re-activate) this device's Expo push token.

    Idempotent, and called on every app launch — tokens can rotate, and a
    device that reinstalled needs to come back. The token column is UNIQUE, so
    the upsert also handles the case where a device was previously registered
    to a DIFFERENT account (shared/borrowed phone): the row is reassigned to
    the current user rather than duplicated, which stops the previous account
    from continuing to receive that device's notifications.
    """
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    existing = (await db.execute(
        select(DeviceToken).where(DeviceToken.fcm_token == body.token)
    )).scalar_one_or_none()

    if existing:
        existing.user_id = user.id
        existing.platform = body.platform
        existing.device_id = body.device_id
        existing.app_version = body.app_version
        existing.is_active = True
        existing.last_seen_at = now
        existing.updated_at = now
    else:
        db.add(DeviceToken(
            user_id=user.id,
            fcm_token=body.token,
            platform=body.platform,
            device_id=body.device_id,
            app_version=body.app_version,
            is_active=True,
            last_seen_at=now,
        ))

    await db.commit()
    return SuccessResponse(message="Device registered")


@router.delete("/device-token", response_model=SuccessResponse)
async def unregister_device_token(
    token: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Deactivate a token — called on sign-out.

    Without this, signing out of a shared device leaves the previous user
    receiving push for their jobs on a phone someone else is now holding.
    Deactivates rather than deletes, so we keep the row for re-activation on
    the next sign-in instead of churning the unique index.
    """
    row = (await db.execute(
        select(DeviceToken).where(
            DeviceToken.fcm_token == token,
            DeviceToken.user_id == user.id,
        )
    )).scalar_one_or_none()

    if row:
        row.is_active = False
        await db.commit()

    # 200 even when nothing matched — sign-out must never fail on this.
    return SuccessResponse(message="Device unregistered")
