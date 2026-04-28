from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from database import get_db
from models import User, Notification
from schemas import NotificationResponse, SuccessResponse
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
