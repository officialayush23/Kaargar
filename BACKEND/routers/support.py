"""
Support router — Users and Workers can create and manage support tickets.
"""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from database import get_db
from models import User, SupportTicket, SupportMessage, Job, WorkerProfile
from schemas import TicketCreate, TicketResponse, TicketMessageCreate, SuccessResponse
from dependencies import get_current_user, require_admin

router = APIRouter()

@router.post("/tickets", response_model=TicketResponse)
async def create_ticket(
    body: TicketCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    worker_id = None
    if body.job_id:
        job = (await db.execute(select(Job).where(Job.id == body.job_id))).scalar_one_or_none()
        if job:
            worker_id = job.worker_id

    ticket = SupportTicket(
        user_id=user.id,
        job_id=body.job_id,
        worker_id=worker_id,
        type=body.type,
        title=body.title,
        description=body.description,
        status="open",
        priority="medium"
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return ticket

@router.get("/tickets", response_model=list[TicketResponse])
async def list_my_tickets(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SupportTicket)
        .where(SupportTicket.user_id == user.id)
        .order_by(SupportTicket.created_at.desc())
    )
    return result.scalars().all()

@router.get("/tickets/{ticket_id}")
async def get_ticket(
    ticket_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ticket = (await db.execute(
        select(SupportTicket).where(SupportTicket.id == ticket_id, SupportTicket.user_id == user.id)
    )).scalar_one_or_none()
    
    if not ticket:
        raise HTTPException(404, "Ticket not found")
        
    messages = (await db.execute(
        select(SupportMessage)
        .where(SupportMessage.ticket_id == ticket.id)
        .order_by(SupportMessage.created_at.asc())
    )).scalars().all()
    
    return {
        "ticket": TicketResponse.model_validate(ticket),
        "messages": [{"sender_role": m.sender_role, "content": m.content, "created_at": m.created_at.isoformat()} for m in messages]
    }

@router.post("/tickets/{ticket_id}/messages", response_model=SuccessResponse)
async def reply_ticket(
    ticket_id: UUID,
    body: TicketMessageCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ticket = (await db.execute(
        select(SupportTicket).where(SupportTicket.id == ticket_id, SupportTicket.user_id == user.id)
    )).scalar_one_or_none()
    if not ticket:
        raise HTTPException(404)
        
    # Check if user has a worker profile to correctly label message
    wp = (await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))).scalar_one_or_none()
    role = "worker" if wp else "user"

    msg = SupportMessage(
        ticket_id=ticket.id,
        sender_id=user.id,
        sender_role=role,
        content=body.content
    )
    db.add(msg)
    
    ticket.updated_at = datetime.now(timezone.utc)
    if ticket.status == "awaiting_user":
        ticket.status = "in_progress"
        
    await db.commit()
    return SuccessResponse(message="Reply sent successfully")


# ── ADMIN SUPPORT ENDPOINTS ────────────────────────────────────────

@router.get("/admin/tickets", response_model=list[TicketResponse])
async def admin_list_tickets(
    status: str = "open",
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: list all tickets filtered by status."""
    q = select(SupportTicket).order_by(SupportTicket.created_at.desc())
    if status and status != "all":
        q = q.where(SupportTicket.status == status)
    result = await db.execute(q)
    return result.scalars().all()


@router.patch("/admin/tickets/{ticket_id}/resolve", response_model=SuccessResponse)
async def admin_resolve_ticket(
    ticket_id: UUID,
    body: dict,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: resolve a ticket with a resolution message."""
    ticket = (await db.execute(
        select(SupportTicket).where(SupportTicket.id == ticket_id)
    )).scalar_one_or_none()
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    ticket.status = "resolved"
    ticket.resolution = body.get("resolution", "")
    ticket.updated_at = datetime.now(timezone.utc)

    # Save admin reply as a message
    if body.get("resolution"):
        msg = SupportMessage(
            ticket_id=ticket.id,
            sender_id=admin.id,
            sender_role="admin",
            content=body["resolution"],
        )
        db.add(msg)

    await db.commit()
    return SuccessResponse(message="Ticket resolved")