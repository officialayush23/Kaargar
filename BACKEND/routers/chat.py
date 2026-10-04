"""
Chat router — messages for active jobs.
"""

import re
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from database import get_db
from models import User, Chat, Message, Job, WorkerProfile
from schemas import MessageCreate, MessageResponse, ChatResponse, SuccessResponse
from dependencies import get_current_user

router = APIRouter()

PHONE_RE = re.compile(r"(?:\+91|0091|91)?[\s\-]?[6-9]\d{9}")
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
SOCIAL_RE = re.compile(r"whatsapp\s*[\:\-]?\s*[\d\s\+\-]+", re.IGNORECASE)


def sanitize(text: str) -> str:
    text = PHONE_RE.sub("[Number Hidden]", text)
    text = EMAIL_RE.sub("[Email Hidden]", text)
    text = SOCIAL_RE.sub("[Contact Hidden]", text)
    return text


async def _get_chat_for_user(job_id: uuid.UUID, user: User, db: AsyncSession) -> Chat:
    result = await db.execute(select(Chat).where(Chat.job_id == job_id))
    chat = result.scalar_one_or_none()
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()

    if not chat:
        # Chat rows used to only be created by the instant-dispatch flow
        # (services/matching._assign_job), so any Discovery/scheduled/
        # multi-day booking — which pins a worker at creation time instead
        # of going through that flow — never got a chat at all, and the
        # customer or worker would hit a 404 on every chat call. Lazily
        # create it here (same pattern services/notifications.post_system_
        # message already uses) the first time either legitimate
        # participant opens the chat, as long as a worker is actually
        # attached to the job — this covers every booking path uniformly
        # without needing a Chat-creation call in each one individually.
        job_result = await db.execute(select(Job).where(Job.id == job_id))
        job = job_result.scalar_one_or_none()
        if not job:
            raise HTTPException(404, "Job not found")
        if not job.worker_id:
            raise HTTPException(404, "Chat not available until a worker is assigned")

        is_participant = (job.user_id == user.id) or (wp and job.worker_id == wp.id)
        if not is_participant:
            raise HTTPException(403)

        chat = Chat(job_id=job.id, user_id=job.user_id, worker_id=job.worker_id)
        db.add(chat)
        await db.commit()
        await db.refresh(chat)
        return chat

    is_participant = (chat.user_id == user.id) or (wp and chat.worker_id == wp.id)
    if not is_participant:
        raise HTTPException(403)
    return chat


@router.get("/{job_id}", response_model=ChatResponse)
async def get_chat(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_chat_for_user(job_id, user, db)


@router.get("/{job_id}/messages", response_model=list[MessageResponse])
async def get_messages(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await _get_chat_for_user(job_id, user, db)
    result = await db.execute(
        select(Message)
        .where(Message.chat_id == chat.id, Message.is_deleted == False)
        .order_by(Message.created_at.asc())
        .limit(200)
    )
    return result.scalars().all()


@router.post("/{job_id}/messages", response_model=MessageResponse)
async def send_message(
    job_id: uuid.UUID,
    body: MessageCreate,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await _get_chat_for_user(job_id, user, db)
    if not chat.is_active:
        raise HTTPException(400, "Chat is closed")

    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    sender_role = "worker" if wp and chat.worker_id == wp.id else "user"

    raw = body.content
    clean = sanitize(raw)

    msg = Message(
        chat_id=chat.id,
        sender_id=user.id,
        sender_role=sender_role,
        type="text",
        raw_content=raw,
        content=clean,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    # Push the OTHER party — after the commit and off the request path, so a
    # slow Expo call never delays the sender's bubble.
    background.add_task(
        _push_chat_message, str(chat.id), str(job_id), sender_role,
        user.full_name or ("Your pro" if sender_role == "worker" else "Customer"), clean,
    )
    return msg


_redis_client = None


async def _throttled(key: str, seconds: int) -> bool:
    """True if a push for `key` already went out within `seconds` (Redis; fails open)."""
    global _redis_client
    try:
        from config import get_settings
        settings = get_settings()
        if not getattr(settings, "redis_url", None):
            return False
        if _redis_client is None:
            import redis.asyncio as aioredis
            _redis_client = aioredis.from_url(settings.redis_url, socket_timeout=0.5, socket_connect_timeout=0.5)
        # SET NX EX: first message in the window wins, the rest are suppressed.
        return not await _redis_client.set(key, "1", nx=True, ex=seconds)
    except Exception:
        return False


async def _push_chat_message(chat_id: str, job_id: str, sender_role: str, sender_name: str, text: str):
    """
    Chat push. Deliberately NOT an in-app notification row: a conversation
    would flood the bell. Throttled to one push per recipient per chat per
    45s so a burst of messages is one buzz, not ten.
    """
    try:
        from database import async_session
        from services.push import push_to_user
        async with async_session() as db:
            chat = (await db.execute(select(Chat).where(Chat.id == uuid.UUID(chat_id)))).scalar_one_or_none()
            if not chat:
                return
            if sender_role == "worker":
                recipient = chat.user_id
            else:
                wp = (await db.execute(select(WorkerProfile).where(WorkerProfile.id == chat.worker_id))).scalar_one_or_none()
                recipient = wp.user_id if wp else None
            if not recipient or await _throttled(f"chatpush:{chat_id}:{recipient}", 45):
                return
            preview = text if len(text) <= 120 else text[:117] + "…"
            await push_to_user(db, recipient, sender_name, preview, {"type": "chat_message", "job_id": job_id})
            await db.commit()
    except Exception:  # noqa: BLE001 — push is best-effort
        import logging
        logging.getLogger(__name__).exception("chat push failed")


@router.patch("/{job_id}/read", response_model=SuccessResponse)
async def mark_read(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat = await _get_chat_for_user(job_id, user, db)
    from datetime import datetime, timezone
    await db.execute(
        Message.__table__.update()
        .where(Message.chat_id == chat.id)
        .where(Message.sender_id != user.id)
        .where(Message.is_read == False)
        .values(is_read=True, read_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return SuccessResponse(message="Messages marked as read")
