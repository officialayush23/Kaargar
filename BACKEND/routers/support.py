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


def _msg_dict(m: SupportMessage) -> dict:
    """
    One shape for a support message, used by every endpoint that returns them.

    `id` matters more than it looks: the mobile support chat subscribes to
    support_messages over Supabase Realtime AND refetches over REST, so it needs
    a stable key to de-duplicate the same message arriving twice. Returning only
    (sender_role, content, created_at) — as this router originally did — left
    the client with nothing reliable to dedupe on.
    """
    return {
        "id": str(m.id),
        "sender_id": str(m.sender_id),
        "sender_role": m.sender_role,
        "content": m.content,
        "created_at": m.created_at.isoformat(),
    }


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
        "messages": [_msg_dict(m) for m in messages],
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


@router.get("/admin/tickets/{ticket_id}")
async def admin_get_ticket(
    ticket_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin: read a ticket thread.

    Needed as a separate endpoint because the customer-facing GET /tickets/{id}
    filters on `SupportTicket.user_id == user.id` — an admin opening someone
    else's ticket got a 404 there, which made it impossible to answer a ticket
    at all without blind-firing the resolve endpoint.
    """
    ticket = (await db.execute(
        select(SupportTicket).where(SupportTicket.id == ticket_id)
    )).scalar_one_or_none()
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    requester = (await db.execute(
        select(User).where(User.id == ticket.user_id)
    )).scalar_one_or_none()

    messages = (await db.execute(
        select(SupportMessage)
        .where(SupportMessage.ticket_id == ticket.id)
        .order_by(SupportMessage.created_at.asc())
    )).scalars().all()

    return {
        "ticket": TicketResponse.model_validate(ticket),
        "requester": {
            "id": str(ticket.user_id),
            "full_name": requester.full_name if requester else None,
            "email": requester.email if requester else None,
            "phone": requester.phone if requester else None,
        },
        "messages": [_msg_dict(m) for m in messages],
    }


@router.post("/admin/tickets/{ticket_id}/messages", response_model=SuccessResponse)
async def admin_reply_ticket(
    ticket_id: UUID,
    body: TicketMessageCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin: reply to a ticket WITHOUT resolving it.

    Previously the only way an admin could write into a thread was
    PATCH .../resolve, which closed the ticket as a side effect. That made a
    genuine back-and-forth impossible — every clarifying question marked the
    issue solved. Support is a conversation; resolving is a separate act.
    """
    ticket = (await db.execute(
        select(SupportTicket).where(SupportTicket.id == ticket_id)
    )).scalar_one_or_none()
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    content = (body.content or "").strip()
    if not content:
        raise HTTPException(422, "Message cannot be empty")

    db.add(SupportMessage(
        ticket_id=ticket.id,
        sender_id=admin.id,
        sender_role="admin",
        content=content,
    ))

    # An admin reply puts the ball back in the user's court. Don't touch
    # resolved/closed tickets' status — replying to a closed ticket to add a
    # note shouldn't silently reopen it.
    if ticket.status in ("open", "in_progress"):
        ticket.status = "awaiting_user"
    ticket.updated_at = datetime.now(timezone.utc)

    await db.commit()

    from services.notifications import create_notification
    await create_notification(
        db=db,
        user_id=ticket.user_id,
        type="support_reply",
        title="Support replied",
        body=content[:140],
        data={"ticket_id": str(ticket.id)},
    )
    # create_notification only flushes; get_db never commits on teardown, so
    # without this the notification is rolled back and silently lost.
    await db.commit()
    return SuccessResponse(message="Reply sent")


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