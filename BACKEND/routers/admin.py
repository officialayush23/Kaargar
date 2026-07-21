"""
Admin router — dashboard, worker approvals, config, payouts, users.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from decimal import Decimal

from database import get_db
from models import Job, WorkerProfile, Payment, Payout, WorkerDocument, PlatformConfig, User, Category
from schemas import AdminDashboard, AdminWorkerAction, AdminConfigUpdate, AdminConfigCreate, SuccessResponse, CategoryCreate, CategoryUpdate, CategoryResponse
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
    from models import WorkerCategory, Service, Tag, ServiceTag
    from sqlalchemy import select as sel

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
    from datetime import datetime, timezone
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
            }
            for p, wp, u, j in rows
        ],
        "total": total,
        "page": page,
        "pages": pages,
    }


@router.get("/payouts/summary")
async def payouts_summary(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: payout totals by status."""
    from datetime import date
    stats = {}
    for status in ("pending", "processing", "paid", "failed"):
        total_amount = await db.scalar(
            select(func.sum(Payout.net_amount)).where(Payout.status == status)
        )
        count = await db.scalar(
            select(func.count(Payout.id)).where(Payout.status == status)
        )
        stats[status] = {"count": count or 0, "total": float(total_amount or 0)}

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
