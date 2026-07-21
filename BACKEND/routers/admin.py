"""
Admin router — dashboard, worker approvals, config, payouts, users.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import aliased
from decimal import Decimal
from datetime import datetime, timezone

from database import get_db
from models import Job, WorkerProfile, Payment, Payout, WorkerDocument, PlatformConfig, User, Category, JobEvent, JobItemReceipt
from schemas import (
    AdminDashboard, AdminWorkerAction, AdminConfigUpdate, AdminConfigCreate, SuccessResponse,
    CategoryCreate, CategoryUpdate, CategoryResponse, PayoutMarkPaid, PayoutMarkFailed,
)
from dependencies import require_admin
from services.storage import get_public_url, delete_worker_verification_files, upload_file, BUCKET_DOCUMENTS, BUCKET_VERIFICATION_VIDEO, BUCKET_PROFILE
from services.config import get_config

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
    worker_ids = [wp.id for wp, _ in rows]
    docs_by_worker: dict = {}
    if worker_ids:
        docs_result = await db.execute(
            select(WorkerDocument)
            .where(WorkerDocument.worker_id.in_(worker_ids))
            .order_by(WorkerDocument.created_at.desc())
        )
        for doc in docs_result.scalars().all():
            doc_path = (doc.cloudinary_id or "").lstrip("/")
            doc_url = get_public_url(BUCKET_DOCUMENTS, doc_path) if doc_path else doc.cloudinary_url
            docs_by_worker.setdefault(str(doc.worker_id), []).append(
                {
                    "id": str(doc.id),
                    "type": doc.type,
                    "cloudinary_url": doc_url,
                    "cloudinary_id": doc_path,
                    "bucket": BUCKET_DOCUMENTS,
                    "status": doc.status,
                    "created_at": doc.created_at.isoformat(),
                }
            )

    return [
        {
            "id": str(wp.id),
            "user_id": str(wp.user_id),
            "full_name": u.full_name,
            "email": u.email,
            "pune_area": wp.pune_area,
            "experience_years": wp.experience_years,
            "created_at": wp.created_at.isoformat(),
            "documents": docs_by_worker.get(str(wp.id), []),
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
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.id == uuid.UUID(worker_id))
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404)
    wp.verification_status = "approved"
    wp.verified_at = now

    docs_result = await db.execute(
        select(WorkerDocument).where(WorkerDocument.worker_id == wp.id)
    )
    docs = docs_result.scalars().all()
    doc_paths, video_path = [], None
    for doc in docs:
        doc.status = "approved"
        doc.rejection_reason = None
        doc.reviewed_by = admin.id
        doc.reviewed_at = now
        if doc.type == "verification_video":
            video_path = doc.cloudinary_id
        elif doc.cloudinary_id:
            doc_paths.append(doc.cloudinary_id)
    await db.commit()

    # Delete identity docs + verification video from Storage (trust model fulfilled)
    delete_worker_verification_files(str(wp.user_id), doc_paths, video_path)

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
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.id == uuid.UUID(worker_id))
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404)
    wp.verification_status = "rejected"
    wp.rejection_reason = body.reason

    docs_result = await db.execute(
        select(WorkerDocument).where(WorkerDocument.worker_id == wp.id)
    )
    docs = docs_result.scalars().all()
    doc_paths, video_path = [], None
    for doc in docs:
        doc.status = "rejected"
        doc.rejection_reason = body.reason
        doc.reviewed_by = admin.id
        doc.reviewed_at = now
        if doc.type == "verification_video":
            video_path = doc.cloudinary_id
        elif doc.cloudinary_id:
            doc_paths.append(doc.cloudinary_id)
    await db.commit()

    # Delete identity docs + verification video from Storage (no reason to keep after rejection)
    delete_worker_verification_files(str(wp.user_id), doc_paths, video_path)

    from services.notifications import create_notification
    await create_notification(
        db=db,
        user_id=wp.user_id,
        type="worker_rejected",
        title="Profile Verification Update",
        body=body.reason or "Your worker profile was rejected. Please re-upload documents and try again.",
        data={},
    )
    return SuccessResponse(message="Worker rejected")


@router.post("/workers/{worker_id}/suspend", response_model=SuccessResponse)
async def suspend_worker(
    worker_id: str,
    body: AdminWorkerAction,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    import uuid as _uuid
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.id == _uuid.UUID(worker_id))
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404)

    # Fetch user for is_active flag
    user_result = await db.execute(select(User).where(User.id == wp.user_id))
    u = user_result.scalar_one_or_none()
    if u:
        u.is_active = False
        if body.reason:
            u.ban_reason = body.reason

    wp.status = "offline"
    wp.verification_status = "rejected"  # treated as suspended — same gate for going online
    wp.rejection_reason = body.reason or "Account suspended by admin"
    await db.commit()

    from services.notifications import create_notification
    await create_notification(
        db=db,
        user_id=wp.user_id,
        type="worker_suspended",
        title="Account Suspended",
        body=body.reason or "Your account has been suspended. Contact support for details.",
        data={},
    )
    return SuccessResponse(message="Worker suspended")


@router.post("/workers/{worker_id}/request-reupload", response_model=SuccessResponse)
async def request_reupload(
    worker_id: str,
    body: AdminWorkerAction,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Ask a pending worker to re-upload specific documents."""
    import uuid as _uuid
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.id == _uuid.UUID(worker_id))
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404)

    # Mark documents as needing reupload
    doc_type = body.doc_type  # optional — if None, flag all pending docs
    docs_result = await db.execute(
        select(WorkerDocument).where(WorkerDocument.worker_id == wp.id)
    )
    for doc in docs_result.scalars().all():
        if doc_type is None or doc.type == doc_type:
            doc.status = "reupload_requested"
            doc.rejection_reason = body.reason or "Please re-upload this document"
            doc.reviewed_by = admin.id
    await db.commit()

    from services.notifications import create_notification
    await create_notification(
        db=db,
        user_id=wp.user_id,
        type="reupload_requested",
        title="Document Re-upload Required",
        body=body.reason or "Please re-upload your documents to complete verification.",
        data={"doc_type": doc_type},
    )
    return SuccessResponse(message="Re-upload request sent")


@router.get("/workers/{worker_id}/detail")
async def get_worker_detail(
    worker_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Full worker detail for admin verification page."""
    import uuid as _uuid
    from models import WorkerCategory, Service

    result = await db.execute(
        select(WorkerProfile, User)
        .join(User, User.id == WorkerProfile.user_id)
        .where(WorkerProfile.id == _uuid.UUID(worker_id))
    )
    row = result.first()
    if not row:
        raise HTTPException(404, "Worker not found")
    wp, u = row

    # Documents (including verification video)
    docs_result = await db.execute(
        select(WorkerDocument).where(WorkerDocument.worker_id == wp.id)
        .order_by(WorkerDocument.created_at.desc())
    )
    documents = []
    for doc in docs_result.scalars().all():
        doc_path = (doc.cloudinary_id or "").lstrip("/")
        bucket = BUCKET_VERIFICATION_VIDEO if doc.type == "verification_video" else BUCKET_DOCUMENTS
        doc_url = get_public_url(bucket, doc_path) if doc_path else doc.cloudinary_url
        documents.append({
            "id": str(doc.id),
            "type": doc.type,
            "url": doc_url,
            "status": doc.status,
            "rejection_reason": doc.rejection_reason,
            "created_at": doc.created_at.isoformat(),
        })

    # Categories
    from models import Category as CatModel
    cats_result = await db.execute(
        select(CatModel)
        .join(WorkerCategory, WorkerCategory.category_id == CatModel.id)
        .where(WorkerCategory.worker_id == wp.id)
    )
    categories = [
        {"id": str(c.id), "name": c.name, "mode": c.mode, "icon_emoji": c.icon_emoji}
        for c in cats_result.scalars().all()
    ]

    # Services summary
    svcs_result = await db.execute(
        select(Service).where(Service.worker_id == wp.id, Service.is_active == True)
    )
    services = [
        {
            "id": str(s.id),
            "title": s.title,
            "price": float(s.price),
            "service_mode": s.service_mode,
        }
        for s in svcs_result.scalars().all()
    ]

    return {
        "id": str(wp.id),
        "user_id": str(wp.user_id),
        "full_name": u.full_name,
        "email": u.email,
        "phone": u.phone,
        "avatar_url": u.avatar_url,
        "verification_status": wp.verification_status,
        "rejection_reason": wp.rejection_reason,
        "status": wp.status,
        "is_active": u.is_active,
        "bio": wp.bio,
        "experience_years": wp.experience_years,
        "pune_area": wp.pune_area,
        "is_instant_available": wp.is_instant_available,
        "is_discovery_available": wp.is_discovery_available,
        "service_radius_km": wp.service_radius_km,
        "avg_rating": float(wp.avg_rating),
        "total_jobs_completed": wp.total_jobs_completed,
        "created_at": wp.created_at.isoformat(),
        "documents": documents,
        "categories": categories,
        "services": services,
    }


@router.get("/config")
async def list_platform_config(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    List every platform_config row for the admin config UI.

    NOTE: this handler used to be named `get_config`, which silently
    rebound the module-level name imported from `services.config` (the
    `get_config(db, key, default)` cache-backed helper used throughout this
    file, e.g. a few hundred lines below to read `max_category_icon_mb`).
    Since Python resolves module-level names at call time, every call to
    the *helper* after this route's definition was actually resolving to
    *this route function* instead — a `(db, key, default)` call against a
    `(admin, db)`-shaped function, which would raise a TypeError the
    moment it was ever hit. Renamed to remove the collision entirely.
    """
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
    """
    Admin: paginated list of all jobs.

    Two things this used to get wrong:

    1. It only ever returned bare Job columns (id/job_type/status/title/
       location_address/quoted_price/created_at) — no category, client,
       worker, or amount. AdminJobs.jsx has always expected nested
       job.category / job.client / job.assigned_worker / job.final_amount
       objects (it renders "—"/"Unassigned" whenever they're missing),
       so the admin Jobs page looked empty no matter what was actually in
       the database. Fixed by joining Category, the client User, the
       worker's WorkerProfile+User, and Payment in ONE query — all 1:1 or
       many:1 joins on indexed PKs/FKs, so this doesn't fan out rows or
       turn into an N+1.

    2. It never filtered on parent_job_id, so a single N-day multi-day
       booking (see Job.parent_job_id's docstring in models.py) showed up
       as N separate rows here — the same "bundle" bug already fixed for
       the customer-facing GET /jobs/me, just never applied to this admin
       endpoint. Fixed by only listing bundle *parents*
       (parent_job_id IS NULL); total_days is still reported per row so
       the admin can see it's a multi-day booking without the list being
       cluttered with every individual day.
    """
    ClientUser = aliased(User)
    WorkerUser = aliased(User)

    q = (
        select(Job, Category, ClientUser, WorkerProfile, WorkerUser, Payment)
        .join(Category, Category.id == Job.category_id)
        .join(ClientUser, ClientUser.id == Job.user_id)
        .outerjoin(WorkerProfile, WorkerProfile.id == Job.worker_id)
        .outerjoin(WorkerUser, WorkerUser.id == WorkerProfile.user_id)
        .outerjoin(Payment, Payment.job_id == Job.id)
        .where(Job.parent_job_id.is_(None))
        .order_by(Job.created_at.desc())
    )
    if status:
        q = q.where(Job.status == status)

    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    q = q.offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(q)).all()
    pages = max(1, -(-total // limit))  # ceiling division

    items = []
    for job, category, client, worker_profile, worker_user, payment in rows:
        final_amount = job.approved_total if job.approved_total is not None else (
            job.final_price if job.final_price is not None else job.quoted_price
        )
        items.append({
            "id": str(job.id),
            "job_type": job.job_type,
            "source": job.source,
            "status": job.status,
            "title": job.title,
            "description": job.description,
            "location_address": job.location_address,
            "location_area": job.location_area,
            "quoted_price": str(job.quoted_price) if job.quoted_price is not None else None,
            "final_amount": str(final_amount) if final_amount is not None else None,
            "payment_status": payment.status if payment else None,
            "category": {"id": str(category.id), "name": category.name},
            "client": {
                "id": str(client.id),
                "full_name": client.full_name,
                "email": client.email,
                "phone": client.phone,
            },
            "assigned_worker": (
                {
                    "id": str(worker_profile.id),
                    "full_name": worker_user.full_name if worker_user else None,
                    "phone": worker_user.phone if worker_user else None,
                    "avg_rating": str(worker_profile.avg_rating),
                }
                if worker_profile is not None else None
            ),
            "is_bundle": bool(job.total_days and job.total_days > 1),
            "total_days": job.total_days,
            "created_at": job.created_at.isoformat(),
        })

    return {"items": items, "total": total, "page": page, "pages": pages}


@router.get("/jobs/{job_id}")
async def get_job_detail(
    job_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin: full detail for a single job — everything list_jobs above
    intentionally leaves out to keep the table light: the payment record,
    every bundle day (if this is a multi-day booking), extra-item receipts,
    and the job's event timeline (status history with actor + timestamp).
    """
    ClientUser = aliased(User)
    WorkerUser = aliased(User)

    row = (await db.execute(
        select(Job, Category, ClientUser, WorkerProfile, WorkerUser, Payment)
        .join(Category, Category.id == Job.category_id)
        .join(ClientUser, ClientUser.id == Job.user_id)
        .outerjoin(WorkerProfile, WorkerProfile.id == Job.worker_id)
        .outerjoin(WorkerUser, WorkerUser.id == WorkerProfile.user_id)
        .outerjoin(Payment, Payment.job_id == Job.id)
        .where(Job.id == job_id)
    )).first()
    if row is None:
        raise HTTPException(404, "Job not found")
    job, category, client, worker_profile, worker_user, payment = row

    # Bundle days: this row might itself be the parent, or (in principle,
    # from a stale/legacy bundle) a child — resolve to the parent id either
    # way so the full day list always comes back regardless of which day's
    # id the admin clicked into.
    bundle_root_id = job.parent_job_id or job.id
    bundle_rows = (await db.execute(
        select(Job)
        .where((Job.id == bundle_root_id) | (Job.parent_job_id == bundle_root_id))
        .order_by(Job.day_index.asc().nulls_first())
    )).scalars().all()

    items_r = await db.execute(
        select(JobItemReceipt).where(JobItemReceipt.job_id == job.id).order_by(JobItemReceipt.created_at.asc())
    )
    events_r = await db.execute(
        select(JobEvent).where(JobEvent.job_id == job.id).order_by(JobEvent.created_at.asc())
    )

    final_amount = job.approved_total if job.approved_total is not None else (
        job.final_price if job.final_price is not None else job.quoted_price
    )

    return {
        "id": str(job.id),
        "job_type": job.job_type,
        "source": job.source,
        "status": job.status,
        "title": job.title,
        "description": job.description,
        "location_address": job.location_address,
        "location_area": job.location_area,
        "location_note": job.location_note,
        "quoted_price": str(job.quoted_price) if job.quoted_price is not None else None,
        "final_price": str(job.final_price) if job.final_price is not None else None,
        "approved_total": str(job.approved_total) if job.approved_total is not None else None,
        "extra_items_total": str(job.extra_items_total) if job.extra_items_total is not None else None,
        "final_amount": str(final_amount) if final_amount is not None else None,
        "commission_rate": str(job.commission_rate) if job.commission_rate is not None else None,
        "platform_fee": str(job.platform_fee) if job.platform_fee is not None else None,
        "gst_on_fee": str(job.gst_on_fee) if job.gst_on_fee is not None else None,
        "worker_payout": str(job.worker_payout) if job.worker_payout is not None else None,
        "cancellation_reason": job.cancellation_reason,
        "cancelled_by": job.cancelled_by,
        "no_show_status": job.no_show_status,
        "assigned_at": job.assigned_at.isoformat() if job.assigned_at else None,
        "en_route_at": job.en_route_at.isoformat() if job.en_route_at else None,
        "arrived_at": job.arrived_at.isoformat() if job.arrived_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "cancelled_at": job.cancelled_at.isoformat() if job.cancelled_at else None,
        "created_at": job.created_at.isoformat(),
        "category": {"id": str(category.id), "name": category.name},
        "client": {
            "id": str(client.id),
            "full_name": client.full_name,
            "email": client.email,
            "phone": client.phone,
        },
        "assigned_worker": (
            {
                "id": str(worker_profile.id),
                "full_name": worker_user.full_name if worker_user else None,
                "phone": worker_user.phone if worker_user else None,
                "email": worker_user.email if worker_user else None,
                "avg_rating": str(worker_profile.avg_rating),
                "rating_count": worker_profile.rating_count,
                "verification_status": worker_profile.verification_status,
            }
            if worker_profile is not None else None
        ),
        "payment": (
            {
                "id": str(payment.id),
                "amount": str(payment.amount),
                "status": payment.status,
                "payment_method": payment.payment_method,
                "held_at": payment.held_at.isoformat() if payment.held_at else None,
                "escrow_released_at": payment.escrow_released_at.isoformat() if payment.escrow_released_at else None,
                "refunded_at": payment.refunded_at.isoformat() if payment.refunded_at else None,
                "refund_amount": str(payment.refund_amount) if payment.refund_amount is not None else None,
            }
            if payment is not None else None
        ),
        "bundle": {
            "total_days": job.total_days,
            "is_bundle": bool(job.total_days and job.total_days > 1),
            "days": [
                {
                    "id": str(b.id),
                    "day_index": b.day_index,
                    "date": (b.preferred_days or [None])[0],
                    "status": b.status,
                }
                for b in bundle_rows
            ],
        },
        "item_receipts": [
            {
                "id": str(it.id),
                "name": it.name,
                "amount": str(it.amount),
                "is_approved": it.is_approved,
            }
            for it in items_r.scalars().all()
        ],
        "events": [
            {
                "status": ev.status,
                "actor": ev.actor,
                "note": ev.note,
                "created_at": ev.created_at.isoformat(),
            }
            for ev in events_r.scalars().all()
        ],
    }


@router.get("/workers")
async def list_workers(
    page: int = 1,
    limit: int = 20,
    status: str = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: paginated list of workers, optionally filtered by verification_status."""
    q = (
        select(WorkerProfile, User)
        .join(User, User.id == WorkerProfile.user_id)
    )
    if status and status in ("pending", "approved", "rejected"):
        q = q.where(WorkerProfile.verification_status == status)

    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    rows = (await db.execute(
        q.order_by(WorkerProfile.created_at.desc())
        .offset((page - 1) * limit).limit(limit)
    )).fetchall()

    # Collect worker IDs so we can attach documents for pending workers
    worker_ids = [wp.id for wp, _ in rows]
    docs_by_worker: dict = {}
    if worker_ids and status == "pending":
        from services.storage import get_public_url, BUCKET_DOCUMENTS
        docs_result = await db.execute(
            select(WorkerDocument)
            .where(WorkerDocument.worker_id.in_(worker_ids))
            .order_by(WorkerDocument.created_at.desc())
        )
        for doc in docs_result.scalars().all():
            doc_path = (doc.cloudinary_id or "").lstrip("/")
            doc_url = get_public_url(BUCKET_DOCUMENTS, doc_path) if doc_path else doc.cloudinary_url
            docs_by_worker.setdefault(str(doc.worker_id), []).append({
                "id": str(doc.id),
                "type": doc.type,
                "cloudinary_url": doc_url,
                "cloudinary_id": doc_path,
                "status": doc.status,
                "created_at": doc.created_at.isoformat(),
            })

    pages = max(1, -(-total // limit))
    return {
        "items": [
            {
                "id": str(wp.id),
                "user_id": str(wp.user_id),
                "full_name": u.full_name,
                "email": u.email,
                "phone": u.phone,
                "avatar_url": u.avatar_url,
                "status": wp.status,
                "verification_status": wp.verification_status,
                "rejection_reason": wp.rejection_reason,
                "pune_area": wp.pune_area,
                "experience_years": wp.experience_years,
                "bio": wp.bio,
                "avg_rating": float(wp.avg_rating) if wp.avg_rating else 0,
                "total_jobs_completed": wp.total_jobs_completed or 0,
                "created_at": wp.created_at.isoformat(),
                "documents": docs_by_worker.get(str(wp.id), []),
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


@router.post("/config", response_model=SuccessResponse)
async def create_config(
    body: AdminConfigCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(PlatformConfig).where(PlatformConfig.key == body.key))
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"Config key '{body.key}' already exists")
    cfg = PlatformConfig(
        key=body.key,
        value=body.value,
        description=body.description,
        updated_by=admin.id,
    )
    db.add(cfg)
    await db.commit()
    return SuccessResponse(message="Config key created")


@router.delete("/config/{key}", response_model=SuccessResponse)
async def delete_config(
    key: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(PlatformConfig).where(PlatformConfig.key == key))
    cfg = result.scalar_one_or_none()
    if not cfg:
        raise HTTPException(404, "Config key not found")
    await db.delete(cfg)
    await db.commit()
    return SuccessResponse(message="Config key deleted")


# ── PROFESSION / CATEGORY MANAGEMENT ────────────────────────────

@router.get("/categories", response_model=list[CategoryResponse])
async def admin_list_categories(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: list all categories (including inactive)."""
    result = await db.execute(
        select(Category).order_by(Category.mode, Category.sort_order)
    )
    return result.scalars().all()


@router.post("/categories", response_model=CategoryResponse)
async def admin_create_category(
    body: CategoryCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: create a new profession/category."""
    existing = await db.scalar(
        select(Category).where(Category.slug == body.slug)
    )
    if existing:
        raise HTTPException(400, f"Slug '{body.slug}' already exists")

    cat = Category(
        name=body.name,
        slug=body.slug,
        description=body.description,
        icon_name=body.icon_name,
        icon_emoji=body.icon_emoji,
        color_hex=body.color_hex,
        mode=body.mode,
        gst_treatment=body.gst_treatment,
        is_featured=body.is_featured,
        sort_order=body.sort_order,
        min_price=body.min_price,
        created_by=admin.id,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.patch("/categories/{category_id}", response_model=CategoryResponse)
async def admin_update_category(
    category_id: str,
    body: CategoryUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: update a profession/category."""
    import uuid as _uuid
    result = await db.execute(
        select(Category).where(Category.id == _uuid.UUID(category_id))
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cat, field, value)

    if body.slug and body.slug != str(cat.slug):
        dupe = await db.scalar(
            select(Category).where(Category.slug == body.slug, Category.id != cat.id)
        )
        if dupe:
            raise HTTPException(400, f"Slug '{body.slug}' already exists")

    await db.commit()
    await db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}", response_model=SuccessResponse)
async def admin_delete_category(
    category_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: soft-delete (deactivate) a category. Hard-delete only if no workers use it."""
    import uuid as _uuid
    from models import WorkerCategory
    result = await db.execute(
        select(Category).where(Category.id == _uuid.UUID(category_id))
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")

    worker_count = await db.scalar(
        select(func.count(WorkerCategory.worker_id))
        .where(WorkerCategory.category_id == cat.id)
    )

    if worker_count and worker_count > 0:
        cat.is_active = False
        await db.commit()
        return SuccessResponse(message=f"Category deactivated ({worker_count} workers still use it)")
    else:
        await db.delete(cat)
        await db.commit()
        return SuccessResponse(message="Category deleted")


@router.post("/categories/{category_id}/upload-icon", response_model=CategoryResponse)
async def admin_upload_category_icon(
    category_id: str,
    file: UploadFile = File(...),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: upload a PNG/SVG/Lottie icon for a category. Stored in Supabase Storage."""
    import uuid as _uuid
    result = await db.execute(
        select(Category).where(Category.id == _uuid.UUID(category_id))
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")

    allowed_types = {"image/png", "image/webp", "image/svg+xml", "application/json", "image/gif"}
    if file.content_type not in allowed_types:
        raise HTTPException(400, "Only PNG, WebP, SVG, GIF, or JSON (Lottie) allowed")

    data = await file.read()
    max_icon_mb = int(await get_config(db, "max_category_icon_mb", 5))
    if len(data) > max_icon_mb * 1024 * 1024:
        raise HTTPException(400, f"File too large (max {max_icon_mb}MB)")

    # Store in profile_photos bucket under category_icons/ prefix
    ct = file.content_type or "image/png"
    if ct == "application/json":
        ext = "json"
    elif ct == "image/svg+xml":
        ext = "svg"
    elif ct == "image/gif":
        ext = "gif"
    elif ct == "image/webp":
        ext = "webp"
    else:
        ext = "png"

    path = f"category_icons/{category_id}.{ext}"
    url = upload_file(BUCKET_PROFILE, path, data, ct)

    cat.icon_url = url
    await db.commit()
    await db.refresh(cat)
    return cat


# ── PAYOUTS ─────────────────────────────────────────────────────

@router.get("/payouts")
async def list_payouts(
    page: int = 1,
    limit: int = 20,
    status: str = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: paginated payout list with worker name and job info."""
    q = (
        select(Payout, WorkerProfile, User, Job)
        .join(WorkerProfile, WorkerProfile.id == Payout.worker_id)
        .join(User, User.id == WorkerProfile.user_id)
        .join(Job, Job.id == Payout.job_id)
    )
    if status:
        q = q.where(Payout.status == status)

    count_q = select(func.count()).select_from(q.subquery())
    total = await db.scalar(count_q)
    rows = (
        await db.execute(
            q.order_by(Payout.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).fetchall()

    pages = max(1, -(-total // limit))
    return {
        "items": [
            {
                "id": str(p.id),
                "worker_name": u.full_name or u.email,
                "worker_id": str(wp.id),
                "job_id": str(p.job_id),
                "job_title": j.title,
                "gross_amount": float(p.gross_amount),
                "platform_fee": float(p.platform_fee),
                "gst_on_fee": float(p.gst_on_fee),
                "tds_deducted": float(p.tds_deducted),
                "net_amount": float(p.net_amount),
                "status": p.status,
                "razorpay_transfer_id": p.razorpay_transfer_id,
                "processed_at": p.processed_at.isoformat() if p.processed_at else None,
                "failure_reason": p.failure_reason,
                "created_at": p.created_at.isoformat(),
                # Where the admin actually sends the money for a manual
                # payout (see PayoutMarkPaid below) — there's no automated
                # disbursement API wired up, so the admin needs these to
                # do the transfer themselves before marking it paid.
                "payout_upi_id": wp.payout_upi_id,
                "payout_bank_account": wp.payout_bank_account,
                "payout_ifsc": wp.payout_ifsc,
                "payout_account_name": wp.payout_account_name,
                "payout_verified": wp.payout_verified,
            }
            for p, wp, u, j in rows
        ],
        "total": total,
        "page": page,
        "pages": pages,
    }


@router.post("/payouts/{payout_id}/mark-paid")
async def mark_payout_paid(
    payout_id: str,
    body: PayoutMarkPaid,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin: record that a payout has actually been sent to the worker.

    This is a MANUAL disbursement flow, not an automated one — Kaargar has
    no RazorpayX/Payouts API integration wired up (that's a separate
    KYC'd product from plain Razorpay checkout, and needs its own
    onboarding), so today the admin transfers the money themselves via
    UPI/NEFT outside this app using the worker's payout_upi_id /
    payout_bank_account (see list_payouts above) and then records that
    transfer here. transfer_reference is whatever proof-of-transfer the
    admin has (a UPI transaction ID, bank UTR number, etc.) — stored on
    the existing razorpay_transfer_id column, which despite the name is
    just "the transfer reference for this payout" and isn't Razorpay-
    specific at the DB level.
    """
    payout = await db.get(Payout, payout_id)
    if payout is None:
        raise HTTPException(404, "Payout not found")
    if payout.status == "paid":
        raise HTTPException(400, "Payout is already marked paid")

    payout.status = "paid"
    payout.processed_at = datetime.now(timezone.utc)
    payout.razorpay_transfer_id = body.transfer_reference
    payout.failure_reason = None
    await db.commit()
    return {"success": True, "message": "Payout marked as paid"}


@router.post("/payouts/{payout_id}/mark-failed")
async def mark_payout_failed(
    payout_id: str,
    body: PayoutMarkFailed,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: record that a payout attempt failed (bad bank details, etc.) — stays in the ledger for retry, doesn't disappear."""
    payout = await db.get(Payout, payout_id)
    if payout is None:
        raise HTTPException(404, "Payout not found")

    payout.status = "failed"
    payout.failure_reason = body.reason
    await db.commit()
    return {"success": True, "message": "Payout marked as failed"}


@router.get("/payouts/summary")
async def payouts_summary(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: payout totals by status."""
    from datetime import date

    # Single GROUP BY query instead of 2 queries x 4 statuses (8 round trips) —
    # same result, one round trip.
    grouped = await db.execute(
        select(Payout.status, func.count(Payout.id), func.sum(Payout.net_amount))
        .group_by(Payout.status)
    )
    by_status = {status: (cnt, amt) for status, cnt, amt in grouped.all()}
    stats = {}
    for status in ("pending", "processing", "paid", "failed"):
        cnt, amt = by_status.get(status, (0, 0))
        stats[status] = {"count": cnt or 0, "total": float(amt or 0)}

    today_paid = await db.scalar(
        select(func.sum(Payout.net_amount))
        .where(Payout.status == "paid")
        .where(func.date(Payout.processed_at) == date.today())
    )
    stats["today_paid"] = float(today_paid or 0)
    return stats


# ── USERS ────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    page: int = 1,
    limit: int = 20,
    role: str = None,
    search: str = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: paginated user list."""
    q = select(User)
    if role:
        q = q.where(User.role == role)
    if search:
        like = f"%{search}%"
        from sqlalchemy import or_
        q = q.where(or_(User.email.ilike(like), User.full_name.ilike(like)))

    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    users = (
        await db.execute(
            q.order_by(User.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).scalars().all()

    pages = max(1, -(-total // limit))
    return {
        "items": [
            {
                "id": str(u.id),
                "email": u.email,
                "full_name": u.full_name,
                "phone": u.phone,
                "role": u.role,
                "is_active": u.is_active,
                "is_banned": u.is_banned,
                "ban_reason": u.ban_reason,
                "created_at": u.created_at.isoformat(),
                "last_seen_at": u.last_seen_at.isoformat() if u.last_seen_at else None,
            }
            for u in users
        ],
        "total": total,
        "page": page,
        "pages": pages,
    }


@router.patch("/users/{user_id}/ban", response_model=SuccessResponse)
async def ban_user(
    user_id: str,
    body: AdminWorkerAction,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: ban a user account."""
    import uuid as _uuid
    result = await db.execute(select(User).where(User.id == _uuid.UUID(user_id)))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(404, "User not found")
    u.is_banned = True
    u.is_active = False
    u.ban_reason = body.reason or "Banned by admin"
    await db.commit()
    return SuccessResponse(message="User banned")


@router.patch("/users/{user_id}/unban", response_model=SuccessResponse)
async def unban_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: unban a user account."""
    import uuid as _uuid
    result = await db.execute(select(User).where(User.id == _uuid.UUID(user_id)))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(404, "User not found")
    u.is_banned = False
    u.is_active = True
    u.ban_reason = None
    await db.commit()
    return SuccessResponse(message="User unbanned")
