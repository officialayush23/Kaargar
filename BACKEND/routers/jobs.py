"""
Jobs router — create, status transitions, lifecycle endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from decimal import Decimal
from datetime import datetime, timezone
from uuid import UUID
import uuid

from database import get_db
from models import (
    User, Job, JobEvent, SOSEvent, ServiceSlot, Service,
    WorkerCategory, WorkerProfile, WorkerScheduleBlock,
    CancellationPenalty, Payment, Notification,
)
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
    from models import Category as CatModel, User as UserModel, WorkerProfile as WP
    active_statuses = [
        "requested", "searching",
        "scheduled",
        "confirmed",
        "worker_assigned",
        "assigned", "en_route", "arrived", "started",
    ]
    q = select(Job).where(Job.user_id == user.id)
    if status == "active":
        q = q.where(Job.status.in_(active_statuses))
    else:
        q = q.where(Job.status.notin_(active_statuses))
    q = q.order_by(Job.created_at.desc()).limit(50)
    result = await db.execute(q)
    jobs = result.scalars().all()

    # Enrich with category name + worker name (batch lookups)
    cat_ids = list({j.category_id for j in jobs})
    worker_ids = list({j.worker_id for j in jobs if j.worker_id})

    cat_map: dict = {}
    if cat_ids:
        cats = await db.execute(select(CatModel.id, CatModel.name).where(CatModel.id.in_(cat_ids)))
        cat_map = {row.id: row.name for row in cats.all()}

    worker_map: dict = {}
    if worker_ids:
        wrows = await db.execute(
            select(WP.id, UserModel.full_name)
            .join(UserModel, UserModel.id == WP.user_id)
            .where(WP.id.in_(worker_ids))
        )
        worker_map = {row.id: row.full_name for row in wrows.all()}

    out = []
    for j in jobs:
        resp = JobResponse.model_validate(j)
        resp.category_name = cat_map.get(j.category_id)
        resp.worker_name = worker_map.get(j.worker_id) if j.worker_id else None
        out.append(resp)
    return out


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from models import Category as CatModel, User as UserModel, WorkerProfile as WP
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404)
    if job.user_id != user.id:
        wp = await db.execute(select(WP).where(WP.user_id == user.id))
        wp = wp.scalar_one_or_none()
        if not wp or job.worker_id != wp.id:
            raise HTTPException(403)
    resp = JobResponse.model_validate(job)
    # Enrich with category name
    cat = await db.execute(select(CatModel.name).where(CatModel.id == job.category_id))
    resp.category_name = cat.scalar_one_or_none()
    # Enrich with worker name
    if job.worker_id:
        wname = await db.execute(
            select(UserModel.full_name)
            .join(WP, WP.user_id == UserModel.id)
            .where(WP.id == job.worker_id)
        )
        resp.worker_name = wname.scalar_one_or_none()
    return resp


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

    # Guard: terminal states cannot be cancelled
    TERMINAL = {"completed", "cancelled", "failed"}
    if job.status in TERMINAL:
        raise HTTPException(409, f"Cannot cancel a job that is already '{job.status}'")

    now = datetime.now(timezone.utc)

    # Resolve caller role
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    is_worker = bool(wp and job.worker_id == wp.id)

    if job.user_id != user.id and not is_worker:
        raise HTTPException(403)

    cancelled_by = "worker" if is_worker else "user"

    # ── Free the schedule block (if any) ─────────────────────────────────────
    if job.worker_id:
        await db.execute(
            delete(WorkerScheduleBlock).where(WorkerScheduleBlock.job_id == job.id)
        )

    # ── Worker-cancels-assigned-job: apply penalty + score hit ───────────────
    ASSIGNED_STATUSES = {"assigned", "confirmed", "en_route", "arrived", "started"}
    if is_worker and job.status in ASSIGNED_STATUSES:
        # Deduct cancellation score (floor at 0.0)
        new_score = max(Decimal("0.00"), (wp.cancellation_score or Decimal("1.00")) - Decimal("0.10"))
        wp.cancellation_score = new_score

        # Record penalty record (₹100, pending collection)
        penalty = CancellationPenalty(
            job_id       = job.id,
            charged_to   = user.id,
            charged_role = "worker",
            amount       = Decimal("100.00"),
            reason       = "Worker cancelled an assigned job",
            status       = "pending",
        )
        db.add(penalty)

        # Reset worker to online (they were "busy")
        wp.status = "online"

        # Re-enqueue scheduled job for reassignment if it has remaining preferred days
        if job.preferred_days and job.status in ("assigned", "confirmed"):
            remaining_days = [
                d for d in (job.preferred_days or [])
                if d >= now.date().isoformat()
            ]
            if remaining_days:
                job.preferred_days = remaining_days
                job.worker_id = None
                job.assigned_at = None
                job.status = "scheduled"   # back to scheduler queue
                await _log_event(db, job.id, "scheduled", "system", user.id, {"reason": "worker_cancel_requeue"})
                # Notify the customer
                db.add(Notification(
                    user_id = job.user_id,
                    type    = "job_worker_cancelled",
                    title   = "Worker cancelled — finding a replacement",
                    body    = "We're finding another worker for your booking. You'll hear from us soon.",
                    data    = {"job_id": str(job.id)},
                ))
                await db.commit()
                return SuccessResponse(message="Job returned to queue for reassignment")

    # ── Trigger refund if payment was held ────────────────────────────────────
    pay_result = await db.execute(select(Payment).where(Payment.job_id == job.id))
    payment = pay_result.scalar_one_or_none()
    if payment and payment.status == "held":
        payment.status = "refund_pending"
        payment.refund_reason = f"Job cancelled by {cancelled_by}: {body.reason or '—'}"
        # Actual Razorpay refund call is handled by the payments router / webhook worker
        # Setting refund_pending flags it for the escrow release task

    # ── Notify the other party ────────────────────────────────────────────────
    if is_worker:
        # Notify the customer
        db.add(Notification(
            user_id = job.user_id,
            type    = "job_cancelled_by_worker",
            title   = "Your booking was cancelled",
            body    = f"The worker has cancelled your booking. Reason: {body.reason or 'Not specified'}. A refund will be processed if applicable.",
            data    = {"job_id": str(job.id)},
        ))
    else:
        # Notify the assigned worker (if any)
        if wp and job.worker_id == wp.id:
            db.add(Notification(
                user_id = wp.user_id,
                type    = "job_cancelled_by_user",
                title   = "Booking cancelled by customer",
                body    = f"The customer has cancelled the booking. Reason: {body.reason or 'Not specified'}.",
                data    = {"job_id": str(job.id)},
            ))
        elif job.worker_id:
            # worker_id set but caller is the user — look up worker's user_id
            other_wp = await db.execute(select(WorkerProfile).where(WorkerProfile.id == job.worker_id))
            other_wp = other_wp.scalar_one_or_none()
            if other_wp:
                db.add(Notification(
                    user_id = other_wp.user_id,
                    type    = "job_cancelled_by_user",
                    title   = "Booking cancelled by customer",
                    body    = f"The customer has cancelled the booking. Reason: {body.reason or 'Not specified'}.",
                    data    = {"job_id": str(job.id)},
                ))

    job.status = "cancelled"
    job.cancelled_at = now
    job.cancellation_reason = body.reason
    job.cancelled_by = cancelled_by
    await _log_event(db, job.id, "cancelled", cancelled_by, user.id)
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

    # Guard: reject if the 10-second dispatch window has already expired
    now_utc = datetime.now(timezone.utc)
    if req.expires_at and now_utc > req.expires_at:
        req.status = "expired"
        await db.commit()
        raise HTTPException(400, "This job request has expired — it was assigned to another worker")

    req.status = "accepted"
    req.responded_at = now_utc
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
    if job.status == "completed":
        raise HTTPException(409, "Job is already completed")
    if job.status not in ("arrived", "started", "assigned", "confirmed", "en_route"):
        raise HTTPException(409, f"Cannot complete a job in '{job.status}' status")

    now = datetime.now(timezone.utc)
    job.completed_at = now
    job.status = "completed"

    # ── Calculate commission + payout if not yet set ──────────────────────────
    if job.quoted_price and not job.final_price:
        job.final_price = job.quoted_price
    if job.final_price and not job.worker_payout:
        from services.matching import calc_commission
        commission = calc_commission(job.job_type or "instant", float(job.final_price))
        job.commission_rate = Decimal(str(commission["rate"]))
        job.platform_fee   = Decimal(str(commission["fee"]))
        job.gst_on_fee     = Decimal(str(commission["gst"]))
        job.worker_payout  = Decimal(str(commission["payout"]))

    # ── Update worker profile stats ───────────────────────────────────────────
    wp.status = "online"
    wp.consecutive_rejects = 0

    wp.total_jobs_completed = (wp.total_jobs_completed or 0) + 1
    # Recalculate completion_rate against total_jobs_requested (floor at 1 to avoid div/0)
    total_requested = max(wp.total_jobs_requested or 0, wp.total_jobs_completed)
    wp.completion_rate = Decimal(str(round(wp.total_jobs_completed / max(total_requested, 1), 4)))

    # Accumulate earnings
    if job.worker_payout:
        wp.total_earnings = (wp.total_earnings or Decimal("0")) + job.worker_payout
        wp.pending_payout = (wp.pending_payout or Decimal("0")) + job.worker_payout

    # Recover cancellation score slightly for each completed job (+0.02, cap 1.0)
    new_score = min(Decimal("1.00"), (wp.cancellation_score or Decimal("1.00")) + Decimal("0.02"))
    wp.cancellation_score = new_score

    # ── Free any schedule block for this job ──────────────────────────────────
    await db.execute(delete(WorkerScheduleBlock).where(WorkerScheduleBlock.job_id == job.id))

    # ── Notify user that job is done ──────────────────────────────────────────
    db.add(Notification(
        user_id = job.user_id,
        type    = "job_completed",
        title   = "Service completed!",
        body    = f"Your service has been completed. Please rate your experience.",
        data    = {"job_id": str(job.id)},
    ))

    await _log_event(db, job.id, "completed", "worker", user.id)
    await db.commit()

    # Refresh analytics for this worker in the background (non-blocking)
    import asyncio
    from tasks.decay_scores import refresh_worker_analytics_for
    asyncio.create_task(refresh_worker_analytics_for(wp.id))

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
    from models import Notification

    now_utc = datetime.now(timezone.utc)

    # Resolve category_id from the service if not supplied directly
    category_id = body.category_id
    if category_id is None and body.service_id:
        svc_r = await db.execute(select(Service).where(Service.id == body.service_id))
        svc = svc_r.scalar_one_or_none()
        if svc:
            category_id = svc.category_id

    # Last-resort: fall back to the pinned worker's primary category (handles services with NULL category_id)
    if category_id is None and body.preferred_worker_id:
        wc_r = await db.execute(
            select(WorkerCategory).where(WorkerCategory.worker_id == body.preferred_worker_id).limit(1)
        )
        wc = wc_r.scalar_one_or_none()
        if wc:
            category_id = wc.category_id

    if category_id is None:
        raise HTTPException(422, "category_id is required — please pick a service or pass category_id")

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
            body    = f"You have a new booking on {slot.slot_date} at {slot.slot_start}.",
            data    = {"job_id": str(job.id)},
        ))
        await db.commit()

    return job


# ── RESCHEDULE ────────────────────────────────────────────────────────────────

@router.patch("/{job_id}/reschedule", response_model=ScheduledJobResponse)
async def reschedule_job(
    job_id: uuid.UUID,
    body: ScheduledJobReschedule,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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
    return job
