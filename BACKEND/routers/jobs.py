"""
Jobs router — create, status transitions, lifecycle endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from decimal import Decimal
from datetime import datetime, timezone
import uuid

from database import get_db
from models import User, Job, JobEvent, SOSEvent
from schemas import JobCreate, JobResponse, JobCancel, SuccessResponse
from dependencies import get_current_user

router = APIRouter()


def _make_geom(lon: float, lat: float):
    return ST_SetSRID(ST_MakePoint(lon, lat), 4326)


async def _log_event(db, job_id, status, actor, actor_id, metadata=None):
    event = JobEvent(
        job_id=job_id,
        status=status,
        actor=actor,
        actor_id=actor_id,
        metadata=metadata or {},
    )
    db.add(event)


@router.post("", response_model=JobResponse)
async def create_job(
    body: JobCreate,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job = Job(
        user_id=user.id,
        category_id=body.category_id,
        job_type=body.job_type,
        status="requested",
        title=body.title,
        description=body.description,
        location_lat=Decimal(str(body.location_lat)),
        location_lon=Decimal(str(body.location_lon)),
        location_address=body.location_address,
        location_area=body.location_area,
        location_geom=_make_geom(body.location_lon, body.location_lat),
        location_note=body.location_note,
        scheduled_at=body.scheduled_at,
        quoted_price=body.quoted_price,
        service_id=body.service_id,
        package_id=body.package_id,
        job_photos=body.photos or [],
    )
    db.add(job)
    await db.flush()
    await _log_event(db, job.id, "requested", "user", user.id)
    await db.commit()
    await db.refresh(job)

    if body.job_type == "instant":
        background.add_task(_dispatch_instant_job, str(job.id))

    return job


async def _dispatch_instant_job(job_id: str):
    from services.matching import dispatch_job
    await dispatch_job(job_id)


@router.get("/me", response_model=list[JobResponse])
async def my_jobs(
    status: str = Query("active"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    active_statuses = ["requested", "searching", "assigned", "en_route", "arrived", "started"]
    q = select(Job).where(Job.user_id == user.id)
    if status == "active":
        q = q.where(Job.status.in_(active_statuses))
    else:
        q = q.where(Job.status.notin_(active_statuses))
    q = q.order_by(Job.created_at.desc()).limit(50)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404)
    if job.user_id != user.id:
        from models import WorkerProfile
        wp = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
        wp = wp.scalar_one_or_none()
        if not wp or job.worker_id != wp.id:
            raise HTTPException(403)
    return job


@router.post("/{job_id}/cancel", response_model=SuccessResponse)
async def cancel_job(
    job_id: uuid.UUID,
    body: JobCancel,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404)

    now = datetime.now(timezone.utc)
    is_worker = False
    from models import WorkerProfile
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if wp and job.worker_id == wp.id:
        is_worker = True

    if job.user_id != user.id and not is_worker:
        raise HTTPException(403)

    job.status = "cancelled"
    job.cancelled_at = now
    job.cancellation_reason = body.reason
    job.cancelled_by = "worker" if is_worker else "user"
    await _log_event(db, job.id, "cancelled", "worker" if is_worker else "user", user.id)
    await db.commit()
    return SuccessResponse(message="Job cancelled")


# ── Worker job actions ────────────────────────────────────────

async def _get_worker_for_job(job_id, user, db):
    from models import WorkerProfile, JobWorkerRequest
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")
    job_result = await db.execute(select(Job).where(Job.id == job_id))
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(404)
    return wp, job


@router.post("/{job_id}/accept", response_model=SuccessResponse)
async def accept_job(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from models import WorkerProfile, JobWorkerRequest
    wp, job = await _get_worker_for_job(job_id, user, db)

    req_result = await db.execute(
        select(JobWorkerRequest)
        .where(JobWorkerRequest.job_id == job_id, JobWorkerRequest.worker_id == wp.id)
        .where(JobWorkerRequest.status == "pending")
    )
    req = req_result.scalar_one_or_none()
    if not req:
        raise HTTPException(400, "No pending request found")

    req.status = "accepted"
    req.responded_at = datetime.now(timezone.utc)
    await db.commit()
    return SuccessResponse(message="Job accepted")


@router.post("/{job_id}/reject", response_model=SuccessResponse)
async def reject_job(
    job_id: uuid.UUID,
    body: JobCancel,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from models import WorkerProfile, JobWorkerRequest
    wp, job = await _get_worker_for_job(job_id, user, db)

    req_result = await db.execute(
        select(JobWorkerRequest)
        .where(JobWorkerRequest.job_id == job_id, JobWorkerRequest.worker_id == wp.id)
        .where(JobWorkerRequest.status == "pending")
    )
    req = req_result.scalar_one_or_none()
    if not req:
        raise HTTPException(400, "No pending request")

    req.status = "rejected"
    req.rejection_reason = body.reason[:50] if body.reason else None
    req.responded_at = datetime.now(timezone.utc)

    # Track consecutive rejects
    wp.consecutive_rejects = (wp.consecutive_rejects or 0) + 1
    from config import get_settings
    threshold = 5
    if wp.consecutive_rejects >= threshold:
        from datetime import timedelta
        wp.auto_offline_until = datetime.now(timezone.utc) + timedelta(minutes=5)
        wp.status = "offline"
        wp.consecutive_rejects = 0

    await db.commit()
    return SuccessResponse(message="Job rejected")


@router.post("/{job_id}/arrived", response_model=SuccessResponse)
async def mark_arrived(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp, job = await _get_worker_for_job(job_id, user, db)
    if job.worker_id != wp.id:
        raise HTTPException(403)
    job.arrived_at = datetime.now(timezone.utc)
    job.status = "arrived"
    await _log_event(db, job.id, "arrived", "worker", user.id)
    await db.commit()
    return SuccessResponse(message="Marked arrived")


@router.post("/{job_id}/start", response_model=SuccessResponse)
async def start_job(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp, job = await _get_worker_for_job(job_id, user, db)
    if job.worker_id != wp.id:
        raise HTTPException(403)
    job.started_at = datetime.now(timezone.utc)
    job.status = "started"
    await _log_event(db, job.id, "started", "worker", user.id)
    await db.commit()
    return SuccessResponse(message="Job started")


@router.post("/{job_id}/complete", response_model=SuccessResponse)
async def complete_job(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp, job = await _get_worker_for_job(job_id, user, db)
    if job.worker_id != wp.id:
        raise HTTPException(403)
    now = datetime.now(timezone.utc)
    job.completed_at = now
    job.status = "completed"
    if job.quoted_price and not job.final_price:
        job.final_price = job.quoted_price
        from services.matching import calc_commission
        commission = calc_commission(job.job_type, float(job.final_price))
        job.commission_rate = Decimal(str(commission["rate"]))
        job.platform_fee = Decimal(str(commission["fee"]))
        job.gst_on_fee = Decimal(str(commission["gst"]))
        job.worker_payout = Decimal(str(commission["payout"]))
    await _log_event(db, job.id, "completed", "worker", user.id)
    await db.commit()
    return SuccessResponse(message="Job completed")


@router.post("/{job_id}/sos", response_model=SuccessResponse)
async def trigger_sos(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404)

    from models import WorkerProfile
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    role = "worker" if wp and job.worker_id == wp.id else "user"

    sos = SOSEvent(
        job_id=job_id,
        triggered_by=user.id,
        triggered_by_role=role,
        status="active",
    )
    db.add(sos)
    await db.commit()
    return SuccessResponse(message="SOS triggered. Support has been notified.")
