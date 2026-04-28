"""
Chat router — messages for active jobs.
"""

import re
from fastapi import APIRouter, Depends, HTTPException
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
    if not chat:
        raise HTTPException(404, "Chat not found")
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
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
    return msg


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
