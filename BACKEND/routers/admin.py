"""
Admin router — dashboard, worker approvals, config.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from decimal import Decimal

from database import get_db
from models import Job, WorkerProfile, Payment, WorkerDocument, PlatformConfig, User
from schemas import AdminDashboard, AdminWorkerAction, AdminConfigUpdate, SuccessResponse
from dependencies import require_admin

router = APIRouter()


@router.get("/dashboard/live", response_model=AdminDashboard)
async def live_dashboard(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    active_statuses = ["searching", "assigned", "en_route", "arrived", "started"]

    active_jobs = await db.scalar(
        select(func.count(Job.id)).where(Job.status.in_(active_statuses))
    )
    searching_jobs = await db.scalar(
        select(func.count(Job.id)).where(Job.status == "searching")
    )
    online_workers = await db.scalar(
        select(func.count(WorkerProfile.id))
        .where(WorkerProfile.status == "online")
        .where(WorkerProfile.verification_status == "approved")
    )

    from datetime import date
    today_rev = await db.scalar(
        select(func.sum(Payment.amount))
        .where(Payment.status.in_(["held", "released"]))
        .where(func.date(Payment.created_at) == date.today())
    )

    total_completed = await db.scalar(
        select(func.count(Job.id)).where(Job.status == "completed")
    )
    total_requested = await db.scalar(
        select(func.count(Job.id)).where(Job.job_type == "instant")
    )
    fill_rate = (total_completed / total_requested * 100) if total_requested else 0

    return AdminDashboard(
        active_jobs=active_jobs or 0,
        online_workers=online_workers or 0,
        today_revenue=today_rev or Decimal("0"),
        fill_rate=round(fill_rate, 1),
        searching_jobs=searching_jobs or 0,
    )


@router.get("/workers/pending")
async def pending_workers(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkerProfile, User)
        .join(User, User.id == WorkerProfile.user_id)
        .where(WorkerProfile.verification_status == "pending")
        .order_by(WorkerProfile.created_at.asc())
    )
    rows = result.fetchall()
    return [
        {
            "id": str(wp.id),
            "user_id": str(wp.user_id),
            "full_name": u.full_name,
            "email": u.email,
            "pune_area": wp.pune_area,
            "created_at": wp.created_at.isoformat(),
        }
        for wp, u in rows
    ]


@router.post("/workers/{worker_id}/approve", response_model=SuccessResponse)
async def approve_worker(
    worker_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    import uuid
    from datetime import datetime, timezone
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.id == uuid.UUID(worker_id))
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404)
    wp.verification_status = "approved"
    wp.verified_at = datetime.now(timezone.utc)
    await db.commit()

    # Notify worker
    from services.notifications import create_notification
    await create_notification(
        db=db,
        user_id=wp.user_id,
        type="worker_approved",
        title="Profile Approved! 🎉",
        body="Your Kaargar worker profile has been approved. You can now go online and start accepting jobs.",
        data={},
    )
    return SuccessResponse(message="Worker approved")


@router.post("/workers/{worker_id}/reject", response_model=SuccessResponse)
async def reject_worker(
    worker_id: str,
    body: AdminWorkerAction,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    import uuid
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.id == uuid.UUID(worker_id))
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404)
    wp.verification_status = "rejected"
    wp.rejection_reason = body.reason
    await db.commit()
    return SuccessResponse(message="Worker rejected")


@router.get("/config")
async def get_config(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(PlatformConfig).order_by(PlatformConfig.key))
    configs = result.scalars().all()
    return [{"key": c.key, "value": c.value, "description": c.description} for c in configs]


@router.get("/jobs")
async def list_jobs(
    status: str = None,
    page: int = 1,
    limit: int = 20,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: paginated list of all jobs."""
    q = select(Job).order_by(Job.created_at.desc())
    if status:
        q = q.where(Job.status == status)
    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    q = q.offset((page - 1) * limit).limit(limit)
    result = await db.execute(q)
    jobs = result.scalars().all()
    pages = max(1, -(-total // limit))  # ceiling division
    return {
        "items": [
            {
                "id": str(j.id),
                "job_type": j.job_type,
                "status": j.status,
                "title": j.title,
                "location_address": j.location_address,
                "quoted_price": str(j.quoted_price) if j.quoted_price else None,
                "created_at": j.created_at.isoformat(),
            }
            for j in jobs
        ],
        "total": total,
        "page": page,
        "pages": pages,
    }


@router.get("/workers")
async def list_workers(
    page: int = 1,
    limit: int = 20,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: paginated list of all workers."""
    total = await db.scalar(select(func.count(WorkerProfile.id)))
    result = await db.execute(
        select(WorkerProfile, User)
        .join(User, User.id == WorkerProfile.user_id)
        .order_by(WorkerProfile.created_at.desc())
        .offset((page - 1) * limit).limit(limit)
    )
    rows = result.fetchall()
    pages = max(1, -(-total // limit))
    return {
        "items": [
            {
                "id": str(wp.id),
                "full_name": u.full_name,
                "email": u.email,
                "status": wp.status,
                "verification_status": wp.verification_status,
                "pune_area": wp.pune_area,
            }
            for wp, u in rows
        ],
        "total": total,
        "page": page,
        "pages": pages,
    }


@router.patch("/config", response_model=SuccessResponse)
async def update_config(
    body: AdminConfigUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone
    result = await db.execute(
        select(PlatformConfig).where(PlatformConfig.key == body.key)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(404, "Config key not found")
    config.value = body.value
    config.updated_at = datetime.now(timezone.utc)
    config.updated_by = admin.id
    await db.commit()
    return SuccessResponse(message="Config updated")
