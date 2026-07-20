"""
Jobs router — create, status transitions, lifecycle endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, UploadFile, File, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func as sa_func
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from uuid import UUID
import uuid
import secrets

from database import get_db
from models import (
    User, Job, JobEvent, SOSEvent, ServiceSlot, Service,
    WorkerCategory, WorkerProfile, WorkerScheduleBlock,
    CancellationPenalty, Payment, Notification, JobItemReceipt,
)
from schemas import (
    JobCreate, JobResponse, JobCancel, SuccessResponse, ScheduledJobCreate,
    ScheduledJobReschedule, ScheduledJobResponse, SlotBookingCreate,
    JobItemReceiptCreate, JobItemReceiptResponse, JobApprovalSummary,
    JobRejectRequest, JobOtpVerifyRequest, JobCompletionCodeResponse,
)
from dependencies import get_current_user
from services.storage import (
    upload_file, BUCKET_JOB_BEFORE_AFTER, BUCKET_JOB_ITEM_PHOTOS,
    job_before_after_path, job_item_photo_path,
)
from services.notifications import post_system_message

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
    as_role: str | None = Query(None, description="'worker' to list jobs assigned to the caller as a worker instead of as a customer"),
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

    if as_role == "worker":
        wp_result = await db.execute(select(WP).where(WP.user_id == user.id))
        wp = wp_result.scalar_one_or_none()
        if not wp:
            return []
        q = select(Job).where(Job.worker_id == wp.id)
    else:
        q = select(Job).where(Job.user_id == user.id)

    if status == "active":
        q = q.where(Job.status.in_(active_statuses))
    elif status != "all":
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
    # Enrich with worker name + avatar
    if job.worker_id:
        wrow = await db.execute(
            select(UserModel.full_name, UserModel.avatar_url)
            .join(WP, WP.user_id == UserModel.id)
            .where(WP.id == job.worker_id)
        )
        w = wrow.first()
        if w:
            resp.worker_name = w.full_name
            resp.worker_avatar_url = w.avatar_url
    # Enrich with client (customer) name + avatar
    crow = await db.execute(select(UserModel.full_name, UserModel.avatar_url).where(UserModel.id == job.user_id))
    c = crow.first()
    if c:
        resp.client_name = c.full_name
        resp.client_avatar_url = c.avatar_url
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


async def _finalize_job_completion(db, job, wp, user_id):
    """
    Shared "mark this job completed" logic. Used by both the direct
    /complete path (jobs with no bill-approval step) and /verify-otp
    (jobs that went through submit-for-approval → approve → OTP).
    Caller is responsible for setting job.final_price to the amount that
    should be commissioned BEFORE calling this (approved_total for the
    bill-approval path, quoted_price fallback for the direct path).
    """
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
    total_requested = max(wp.total_jobs_requested or 0, wp.total_jobs_completed)
    wp.completion_rate = Decimal(str(round(wp.total_jobs_completed / max(total_requested, 1), 4)))

    if job.worker_payout:
        wp.total_earnings = (wp.total_earnings or Decimal("0")) + job.worker_payout
        wp.pending_payout = (wp.pending_payout or Decimal("0")) + job.worker_payout

    new_score = min(Decimal("1.00"), (wp.cancellation_score or Decimal("1.00")) + Decimal("0.02"))
    wp.cancellation_score = new_score

    await db.execute(delete(WorkerScheduleBlock).where(WorkerScheduleBlock.job_id == job.id))

    db.add(Notification(
        user_id = job.user_id,
        type    = "job_completed",
        title   = "Service completed!",
        body    = "Your service has been completed. Please rate your experience.",
        data    = {"job_id": str(job.id)},
    ))

    await _log_event(db, job.id, "completed", "worker", user_id)

    import asyncio
    from tasks.decay_scores import refresh_worker_analytics_for
    asyncio.create_task(refresh_worker_analytics_for(wp.id))


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

    await _finalize_job_completion(db, job, wp, user.id)
    await db.commit()
    return SuccessResponse(message="Job completed")


# ── Job completion flow: photos, extra items, approval, OTP ──────────────────

ALLOWED_MEDIA_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_MEDIA_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/{job_id}/media")
async def upload_job_media(
    job_id: uuid.UUID,
    kind: str = Query(..., pattern="^(before|after|item_photo|receipt_photo)$"),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Uploads a single photo for the job-completion flow.
    kind='before'|'after'   → job_before_after bucket; URL is appended directly
                               to job.before_photos / job.after_photos.
    kind='item_photo'|'receipt_photo' → job_item_photos bucket; URL is only
                               returned — the client attaches it when calling
                               POST /jobs/{job_id}/items.
    """
    wp, job = await _get_worker_for_job(job_id, user, db)
    if job.worker_id != wp.id:
        raise HTTPException(403)
    if job.status not in ("arrived", "started"):
        raise HTTPException(409, f"Cannot add job media while status is '{job.status}'")

    if file.content_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(400, "Only JPEG/PNG/WebP images allowed")
    data = await file.read()
    if len(data) > MAX_MEDIA_SIZE:
        raise HTTPException(400, "Image must be under 10MB")

    if kind in ("before", "after"):
        path = job_before_after_path(str(user.id), str(job_id), kind, file.filename or "photo.jpg")
        url = upload_file(BUCKET_JOB_BEFORE_AFTER, path, data, file.content_type)
        if kind == "before":
            job.before_photos = [*(job.before_photos or []), url]
        else:
            job.after_photos = [*(job.after_photos or []), url]
        await db.commit()
    else:
        path = job_item_photo_path(str(user.id), str(job_id), kind, file.filename or "photo.jpg")
        url = upload_file(BUCKET_JOB_ITEM_PHOTOS, path, data, file.content_type)

    return {"url": url, "path": path}


@router.get("/{job_id}/items", response_model=list[JobItemReceiptResponse])
async def list_job_items(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job_result = await db.execute(select(Job).where(Job.id == job_id))
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(404)

    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if job.user_id != user.id and not (wp and job.worker_id == wp.id):
        raise HTTPException(403)

    result = await db.execute(
        select(JobItemReceipt).where(JobItemReceipt.job_id == job_id).order_by(JobItemReceipt.created_at)
    )
    items = result.scalars().all()
    return [
        JobItemReceiptResponse(
            id=i.id, job_id=i.job_id, name=i.name, amount=i.amount,
            item_photo_url=i.item_photo_path, receipt_photo_url=i.receipt_photo_path,
            is_approved=i.is_approved, created_at=i.created_at,
        )
        for i in items
    ]


@router.post("/{job_id}/items", response_model=JobItemReceiptResponse)
async def add_job_item(
    job_id: uuid.UUID,
    body: JobItemReceiptCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp, job = await _get_worker_for_job(job_id, user, db)
    if job.worker_id != wp.id:
        raise HTTPException(403)
    if job.status != "started":
        raise HTTPException(409, "Extra items can only be added while the job is in progress")

    # Cap: 20 items per job (sane ceiling, not a hard product limit)
    count_result = await db.execute(
        select(sa_func.count()).select_from(JobItemReceipt).where(JobItemReceipt.job_id == job_id)
    )
    if (count_result.scalar() or 0) >= 20:
        raise HTTPException(400, "Maximum of 20 extra items per job")

    item = JobItemReceipt(
        job_id=job_id,
        created_by=wp.id,
        name=body.name,
        amount=body.amount,
        item_photo_path=body.item_photo_url,
        receipt_photo_path=body.receipt_photo_url,
    )
    db.add(item)

    # Recompute the denormalized total server-side (never trust a client-supplied total)
    await db.flush()
    total_result = await db.execute(
        select(sa_func.coalesce(sa_func.sum(JobItemReceipt.amount), 0))
        .where(JobItemReceipt.job_id == job_id)
    )
    job.extra_items_total = total_result.scalar() or Decimal("0")

    await db.commit()
    await db.refresh(item)
    return JobItemReceiptResponse(
        id=item.id, job_id=item.job_id, name=item.name, amount=item.amount,
        item_photo_url=item.item_photo_path, receipt_photo_url=item.receipt_photo_path,
        is_approved=item.is_approved, created_at=item.created_at,
    )


@router.delete("/{job_id}/items/{item_id}", response_model=SuccessResponse)
async def delete_job_item(
    job_id: uuid.UUID,
    item_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp, job = await _get_worker_for_job(job_id, user, db)
    if job.worker_id != wp.id:
        raise HTTPException(403)
    if job.status != "started":
        raise HTTPException(409, "Extra items can only be edited while the job is in progress")

    result = await db.execute(
        select(JobItemReceipt).where(JobItemReceipt.id == item_id, JobItemReceipt.job_id == job_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404)
    await db.delete(item)
    await db.flush()

    total_result = await db.execute(
        select(sa_func.coalesce(sa_func.sum(JobItemReceipt.amount), 0))
        .where(JobItemReceipt.job_id == job_id)
    )
    job.extra_items_total = total_result.scalar() or Decimal("0")
    await db.commit()
    return SuccessResponse(message="Item removed")


@router.post("/{job_id}/submit-for-approval", response_model=SuccessResponse)
async def submit_for_approval(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp, job = await _get_worker_for_job(job_id, user, db)
    if job.worker_id != wp.id:
        raise HTTPException(403)
    if job.status != "started":
        raise HTTPException(409, f"Cannot submit for approval from status '{job.status}'")
    if not job.before_photos:
        raise HTTPException(400, "At least one before-photo is required")
    if not job.after_photos:
        raise HTTPException(400, "At least one after-photo is required")

    job.status = "awaiting_approval"
    job.submitted_for_approval_at = datetime.now(timezone.utc)
    await _log_event(db, job.id, "awaiting_approval", "worker", user.id)

    db.add(Notification(
        user_id=job.user_id,
        type="job_bill_ready",
        title="Bill ready for review",
        body="Your service provider has submitted the job for your approval.",
        data={"job_id": str(job.id)},
    ))
    await post_system_message(db, job, "bill_submitted", "Bill submitted — waiting for customer approval.")

    await db.commit()
    return SuccessResponse(message="Submitted for customer approval")


@router.get("/{job_id}/approval-summary", response_model=JobApprovalSummary)
async def get_approval_summary(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job_result = await db.execute(select(Job).where(Job.id == job_id))
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(404)

    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if job.user_id != user.id and not (wp and job.worker_id == wp.id):
        raise HTTPException(403)

    items_result = await db.execute(
        select(JobItemReceipt).where(JobItemReceipt.job_id == job_id).order_by(JobItemReceipt.created_at)
    )
    items = items_result.scalars().all()

    return JobApprovalSummary(
        id=job.id,
        status=job.status,
        before_photos=job.before_photos or [],
        after_photos=job.after_photos or [],
        final_price=job.final_price,
        extra_items_total=job.extra_items_total or Decimal("0"),
        approved_total=job.approved_total,
        items=[
            JobItemReceiptResponse(
                id=i.id, job_id=i.job_id, name=i.name, amount=i.amount,
                item_photo_url=i.item_photo_path, receipt_photo_url=i.receipt_photo_path,
                is_approved=i.is_approved, created_at=i.created_at,
            )
            for i in items
        ],
    )


@router.post("/{job_id}/approve", response_model=SuccessResponse)
async def approve_job_bill(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "awaiting_approval":
        raise HTTPException(409, f"Cannot approve a job in '{job.status}' status")

    base = job.final_price or job.quoted_price or Decimal("0")
    job.approved_total = base + (job.extra_items_total or Decimal("0"))
    job.approved_at = datetime.now(timezone.utc)
    job.status = "approved"

    # Generate the completion OTP — never returned to the worker's client.
    job.completion_otp_code = f"{secrets.randbelow(1_000_000):06d}"
    job.completion_otp_expires_at = job.approved_at + timedelta(hours=4)
    job.completion_otp_attempts = 0
    job.completion_otp_locked_until = None

    await db.execute(
        JobItemReceipt.__table__.update()
        .where(JobItemReceipt.job_id == job_id)
        .values(is_approved=True, approved_at=job.approved_at)
    )

    if job.worker_id:
        wp_r = await db.execute(select(WorkerProfile).where(WorkerProfile.id == job.worker_id))
        wp = wp_r.scalar_one_or_none()
        if wp:
            db.add(Notification(
                user_id=wp.user_id,
                type="job_bill_approved",
                title="Bill approved!",
                body="The customer approved the bill. Ask them for the completion code to finish the job.",
                data={"job_id": str(job.id)},
            ))
    await post_system_message(db, job, "bill_approved", "Customer approved the bill.")

    await _log_event(db, job.id, "approved", "user", user.id)
    await db.commit()
    return SuccessResponse(message="Approved — share the completion code with your service provider")


@router.post("/{job_id}/reject-approval", response_model=SuccessResponse)
async def reject_job_bill(
    job_id: uuid.UUID,
    body: JobRejectRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "awaiting_approval":
        raise HTTPException(409, f"Cannot reject a job in '{job.status}' status")

    job.status = "disputed"

    # Reuse the existing SOS/dispute mechanism rather than a new table.
    db.add(SOSEvent(
        job_id=job_id,
        triggered_by=user.id,
        triggered_by_role="user",
        status="active",
        notes=f"Bill rejected: {body.reason}",
    ))

    if job.worker_id:
        wp_r = await db.execute(select(WorkerProfile).where(WorkerProfile.id == job.worker_id))
        wp = wp_r.scalar_one_or_none()
        if wp:
            db.add(Notification(
                user_id=wp.user_id,
                type="job_bill_disputed",
                title="Bill disputed",
                body=f"The customer disputed the bill: {body.reason}",
                data={"job_id": str(job.id)},
            ))
    await post_system_message(db, job, "bill_disputed", f"Customer disputed the bill: {body.reason}")

    await _log_event(db, job.id, "disputed", "user", user.id, {"reason": body.reason})
    await db.commit()
    return SuccessResponse(message="Dispute raised — support has been notified")


@router.get("/{job_id}/completion-code", response_model=JobCompletionCodeResponse)
async def get_completion_code(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Customer-only. Never reachable by the worker's account, even by guessing the URL."""
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "approved" or not job.completion_otp_code:
        raise HTTPException(409, "No active completion code for this job")
    return JobCompletionCodeResponse(code=job.completion_otp_code, expires_at=job.completion_otp_expires_at)


@router.post("/{job_id}/verify-otp", response_model=SuccessResponse)
async def verify_completion_otp(
    job_id: uuid.UUID,
    body: JobOtpVerifyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp, job = await _get_worker_for_job(job_id, user, db)
    if job.worker_id != wp.id:
        raise HTTPException(403)
    if job.status != "approved":
        raise HTTPException(409, f"Cannot verify a code for a job in '{job.status}' status")

    now = datetime.now(timezone.utc)
    if job.completion_otp_locked_until and now < job.completion_otp_locked_until:
        raise HTTPException(423, "Too many wrong attempts — try again later")
    if not job.completion_otp_expires_at or now > job.completion_otp_expires_at:
        raise HTTPException(410, "Completion code expired — ask the customer to re-approve")

    if body.code != job.completion_otp_code:
        job.completion_otp_attempts = (job.completion_otp_attempts or 0) + 1
        if job.completion_otp_attempts >= 5:
            job.completion_otp_locked_until = now + timedelta(minutes=15)
            job.completion_otp_attempts = 0
            await db.commit()
            raise HTTPException(423, "Too many wrong attempts — locked for 15 minutes")
        await db.commit()
        raise HTTPException(400, f"Incorrect code ({5 - job.completion_otp_attempts} attempts left)")

    # ── Match — finalize the job using the customer-approved total ───────────
    job.final_price = job.approved_total
    job.completion_otp_code = None
    job.completion_otp_expires_at = None
    job.completion_otp_attempts = 0
    job.completion_otp_locked_until = None

    await _finalize_job_completion(db, job, wp, user.id)
    await post_system_message(db, job, "job_completed", "Job completed — payment is being processed.")
    await db.commit()
    return SuccessResponse(message="Job completed — payment will be requested from the customer")


@router.post("/{job_id}/sos", response_model=SuccessResponse)
async def trigger_sos(
    job_id: uuid.UUID,
    body: dict | None = Body(default=None),
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
        notes=(body or {}).get("notes"),
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
