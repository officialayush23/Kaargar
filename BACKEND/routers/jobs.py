"""
Jobs router — create, status transitions, lifecycle endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from decimal import Decimal
from datetime import datetime, timezone
from uuid import UUID
import uuid

from database import get_db
from models import User, Job, JobEvent, SOSEvent, ServiceSlot, Service
from schemas import JobCreate, JobResponse, JobCancel, SuccessResponse, ScheduledJobCreate, ScheduledJobReschedule, ScheduledJobResponse, SlotBookingCreate
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
        meta=metadata or {},
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


# ── SCHEDULED JOB ENDPOINTS ───────────────────────────────────────────────────

@router.post("/scheduled", response_model=ScheduledJobResponse, status_code=201)
async def create_scheduled_job(
    body: ScheduledJobCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a scheduled job — two modes:

    Direct worker (preferred_worker_id set):
      • Pinned to that specific worker immediately (status='confirmed').
      • Worker is notified right away.
      • Used by the discovery booking flow when user picked a specific worker.

    Lazy assignment (no preferred_worker_id):
      • status='scheduled', scheduler assigns the best worker ~2h before window.
      • Used for generic/category-based bookings.
    """
    from datetime import time as _time, date as _date
    from models import Notification, WorkerProfile, Service

    now_utc = datetime.now(timezone.utc)

    # Resolve category_id from the service if not supplied directly
    category_id = body.category_id
    if category_id is None and body.service_id:
        svc_r = await db.execute(select(Service).where(Service.id == body.service_id))
        svc = svc_r.scalar_one_or_none()
        if svc:
            category_id = svc.category_id

    if category_id is None:
        raise HTTPException(422, "category_id is required when service_id is not provided")

    is_direct = body.preferred_worker_id is not None
    initial_status = "confirmed" if is_direct else "scheduled"

    job = Job(
        user_id          = user.id,
        category_id      = category_id,
        service_id       = body.service_id,
        package_id       = body.package_id,
        worker_id        = body.preferred_worker_id,  # None → lazy; UUID → direct
        job_type         = body.source,
        source           = body.source,
        status           = initial_status,
        is_flexible      = True,
        preferred_days   = body.preferred_days,
        window_start     = _time.fromisoformat(body.window_start),
        window_end       = _time.fromisoformat(body.window_end),
        title            = body.title,
        description      = body.description,
        location_lat     = Decimal(str(body.location_lat)),
        location_lon     = Decimal(str(body.location_lon)),
        location_address = body.location_address,
        location_area    = body.location_area,
        location_note    = body.location_note,
        location_geom    = _make_geom(body.location_lon, body.location_lat),
        budget_max       = body.budget_max,
        assigned_at      = now_utc if is_direct else None,
    )
    db.add(job)
    await db.flush()

    event_meta = {
        "preferred_days": body.preferred_days,
        "window": f"{body.window_start}–{body.window_end}",
    }
    if is_direct:
        event_meta["pinned_worker_id"] = str(body.preferred_worker_id)

    await _log_event(db, job.id, initial_status, "user", user.id, event_meta)

    # ── Notify user ───────────────────────────────────────────────────────────
    first_day = _date.fromisoformat(body.preferred_days[0]).strftime('%d %b')
    if is_direct:
        user_notif_body = (
            f"Your booking is confirmed for {first_day} "
            f"between {body.window_start} – {body.window_end}. "
            f"Your worker will arrive within this window."
        )
    else:
        user_notif_body = (
            f"We'll assign the best worker and notify you on {first_day} "
            f"(or your next preferred date) between {body.window_start} – {body.window_end}."
        )

    db.add(Notification(
        user_id = user.id,
        type    = "job_scheduled_confirm",
        title   = "Booking confirmed!" if is_direct else "Booking received!",
        body    = user_notif_body,
        data    = {"job_id": str(job.id)},
    ))

    # ── If direct booking, notify the chosen worker immediately ───────────────
    if is_direct:
        wp_r = await db.execute(
            select(WorkerProfile).where(WorkerProfile.id == body.preferred_worker_id)
        )
        wp = wp_r.scalar_one_or_none()
        if wp:
            db.add(Notification(
                user_id = wp.user_id,
                type    = "job_assigned",
                title   = "New Booking",
                body    = (
                    f"You have a new booking on {first_day} "
                    f"between {body.window_start} – {body.window_end}."
                ),
                data    = {"job_id": str(job.id)},
            ))

    await db.commit()
    await db.refresh(job)
    return job


@router.post("/book-slot", response_model=ScheduledJobResponse, status_code=201)
async def book_slot(
    body: SlotBookingCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Book a specific time slot (slot-based services only).

    Uses SELECT FOR UPDATE to prevent race conditions — if two users hit this
    endpoint simultaneously for the same slot, one gets 409 while the other
    succeeds. The DB trigger trg_slot_booking keeps booked_count in sync.

    Returns 409 if the slot is full or blocked.
    """
    from models import WorkerProfile, Notification

    # ── Atomic slot lock (SELECT FOR UPDATE) ─────────────────────────────────
    # Blocks concurrent requests targeting the same slot row until this
    # transaction commits, preventing double-booking.
    slot_result = await db.execute(
        select(ServiceSlot)
        .where(ServiceSlot.id == body.slot_id)
        .with_for_update()          # row-level lock released on commit
    )
    slot = slot_result.scalar_one_or_none()
    if not slot:
        raise HTTPException(404, "Slot not found")
    if slot.is_blocked:
        raise HTTPException(409, "This slot is no longer available")
        raise HTTPException(409, "This slot is fully booked — please pick another time")

    # ── Load service ──────────────────────────────────────────────────────────
    svc_result = await db.execute(select(Service).where(Service.id == body.service_id))
    svc = svc_result.scalar_one_or_none()
    if not svc:
        raise HTTPException(404, "Service not found")

    now_utc = datetime.now(timezone.utc)
    slot_dt = datetime.combine(slot.slot_date, slot.slot_start, tzinfo=timezone.utc)
    price   = svc.base_price if svc.base_price is not None else svc.price

    # ── Create job (worker pre-assigned from slot) ────────────────────────────
    job = Job(
        user_id          = user.id,
        category_id      = svc.category_id,
        service_id       = body.service_id,
        package_id       = body.package_id,
        worker_id        = slot.worker_id,   # immediately assigned
        job_type         = "discovery",
        source           = "slot",
        status           = "confirmed",
        title            = svc.title,
        location_lat     = Decimal(str(body.location_lat)),
        location_lon     = Decimal(str(body.location_lon)),
        location_address = body.location_address,
        location_area    = body.location_area,
        location_note    = body.location_note,
        location_geom    = _make_geom(body.location_lon, body.location_lat),
        slot_id          = slot.id,
        scheduled_at     = slot_dt,
        quoted_price     = price,
        assigned_at      = now_utc,
    )
    db.add(job)
    await db.flush()

    await _log_event(db, job.id, "confirmed", "user", user.id, {
        "slot_id":    str(slot.id),
        "slot_date":  str(slot.slot_date),
        "slot_start": str(slot.slot_start),
        "worker_id":  str(slot.worker_id),
    })

    # DB trigger trg_slot_booking increments booked_count after commit
    await db.commit()
    await db.refresh(job)

    # ── Notify the worker (Notification.user_id = worker's auth user_id) ─────
    from models import WorkerProfile, Notification
    wp_r = await db.execute(
        select(WorkerProfile).where(WorkerProfile.id == slot.worker_id)
    )
    wp = wp_r.scalar_one_or_none()
    if wp:
        db.add(Notification(
            user_id = wp.user_id,
            type    = "job_assigned",
            title   = "New Slot Booking",
            body    = (
                f"New booking: {svc.title} on "
                f"{slot.slot_date.strftime('%d %b')} "
                f"at {slot.slot_start.strftime('%H:%M')}"
            ),
            data    = {"job_id": str(job.id)},
        ))
        await db.commit()

    return job


@router.patch("/{job_id}/reschedule", summary="Reschedule a window-based job (user)")
async def reschedule_job(
    job_id: UUID,
    body: ScheduledJobReschedule,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Allow user to change preferred days/window before a worker is assigned."""
    result = await db.execute(
        select(Job).where(Job.id == job_id, Job.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status not in ("pending", "searching", "scheduled"):
        raise HTTPException(409, f"Cannot reschedule a job in '{job.status}' status")
    if job.slot_id:
        raise HTTPException(400, "Slot-based bookings cannot be rescheduled here — cancel and rebook")

    job.preferred_days  = body.preferred_days
    job.window_start    = body.window_start
    job.window_end      = body.window_end

    await db.commit()
    await db.refresh(job)
    return {"job_id": str(job.id), "status": job.status, "message": "Reschedule request updated"}
