"""
Workers router.

IMPORTANT: All static-path routes (/profile, /me/*, /status, /location, /documents)
MUST be declared before the dynamic /{worker_id} route, otherwise FastAPI matches
/{worker_id} first and treats the literal string as a UUID — causing 404/422 errors.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from typing import Optional
from decimal import Decimal
import uuid

from database import get_db
from models import (
    User, WorkerProfile, WorkerCategory, WorkerAnalytics, Service, ServiceMedia,
    Package, PackageService as PackageServiceModel, Offer, PackageOrder, PackageUsage,
    WorkerAvailability, WorkerTimeOff, WorkerScheduleBlock,
    ServiceSlotConfig, ServiceSlot, Tag, ServiceTag,
)
from schemas import (
    WorkerProfileCreate, WorkerProfileUpdate, WorkerProfileResponse,
    WorkerPublicResponse, WorkerStatusUpdate, WorkerLocationUpdate,
    WorkerDocumentResponse, DocumentUpload, ServiceCreate, ServiceUpdate,
    ServiceResponse, WorkerAnalyticsResponse, SuccessResponse,
    PackageCreate, PackageUpdate, PackageResponse, PackageItemResponse,
    OfferCreate, OfferUpdate, OfferResponse,
    PackageOrderCreate, PackageOrderResponse, PackageUsageResponse,
    WorkerAvailabilitySet, WorkerAvailabilityResponse,
    WorkerTimeOffCreate, WorkerTimeOffResponse, WorkerScheduleBlockResponse,
    SlotConfigCreate, SlotConfigResponse, SlotResponse, SlotGenerateRequest,
    TagResponse, TagCreate, ServiceTagsSet,
)
from dependencies import get_current_user
from services.storage import get_public_url, BUCKET_DOCUMENTS, BUCKET_VERIFICATION_VIDEO
from services.translation import translate_and_store

router = APIRouter()


# ═══════════════════════════════════════════════════════════
# SELF / AUTHENTICATED WORKER ROUTES  (must be before /{id})
# ═══════════════════════════════════════════════════════════

@router.get("/profile", response_model=WorkerProfileResponse)
async def get_my_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")
    return wp


@router.post("/profile", response_model=WorkerProfileResponse)
async def create_profile(
    body: WorkerProfileCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Worker profile already exists")

    wp = WorkerProfile(
        user_id=user.id,
        bio=body.bio,
        experience_years=body.experience_years,
        pune_area=body.pune_area,
        service_radius_km=body.service_radius_km,
        allow_multi_day_booking=body.allow_multi_day_booking,
    )
    if user.role != "admin":
        user.role = "worker"
    db.add(wp)
    await db.flush()

    for cat_id in body.category_ids:
        db.add(WorkerCategory(worker_id=wp.id, category_id=cat_id))

    await db.commit()
    await db.refresh(wp)
    return wp


@router.patch("/profile", response_model=WorkerProfileResponse)
async def update_profile(
    body: WorkerProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found — create one first via POST /workers/profile")

    updates = body.model_dump(exclude_none=True)

    # full_name lives on the User record, not WorkerProfile — handle separately
    full_name = updates.pop("full_name", None)
    for field, value in updates.items():
        setattr(wp, field, value)

    if full_name:
        user.full_name = full_name

    await db.commit()
    await db.refresh(wp)
    return wp


@router.patch("/status", response_model=SuccessResponse)
async def update_status(
    body: WorkerStatusUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")
    if wp.verification_status != "approved":
        raise HTTPException(403, "Your account must be approved by admin before you can go online")
    wp.status = body.status
    await db.commit()
    return SuccessResponse(message=f"Status set to {body.status}")


@router.post("/location", response_model=SuccessResponse)
async def update_location(
    body: WorkerLocationUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        import redis.asyncio as aioredis
        from config import get_settings
        r = aioredis.from_url(get_settings().redis_url)
        key = f"loc_limit:{user.id}"
        if await r.exists(key):
            await r.aclose()
            return SuccessResponse(message="Rate limited")
        await r.setex(key, 3, 1)
        await r.aclose()
    except Exception:
        pass

    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")

    from models import WorkerLocation
    geom = ST_SetSRID(ST_MakePoint(body.lon, body.lat), 4326)

    existing_loc = await db.execute(
        select(WorkerLocation).where(WorkerLocation.worker_id == wp.id)
    )
    loc = existing_loc.scalar_one_or_none()

    if loc:
        loc.lat = Decimal(str(body.lat))
        loc.lon = Decimal(str(body.lon))
        loc.geom = geom
        if body.accuracy_m:
            loc.accuracy_m = Decimal(str(body.accuracy_m))
        if body.heading:
            loc.heading = Decimal(str(body.heading))
        from datetime import datetime, timezone
        loc.updated_at = datetime.now(timezone.utc)
    else:
        db.add(WorkerLocation(
            worker_id=wp.id,
            lat=Decimal(str(body.lat)),
            lon=Decimal(str(body.lon)),
            geom=geom,
        ))

    # Log to location_history (raw ping trail for job audit / heat maps)
    from models import LocationHistory
    db.add(LocationHistory(
        worker_id=wp.id,
        lat=Decimal(str(body.lat)),
        lon=Decimal(str(body.lon)),
        geom=geom,
    ))

    await db.commit()
    return SuccessResponse(message="Location updated")


@router.post("/documents", response_model=WorkerDocumentResponse)
async def upload_document(
    body: DocumentUpload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")

    from models import WorkerDocument

    document_type = body.type.strip().lower()
    document_url = body.cloudinary_url.strip()
    document_path = body.cloudinary_id.strip().lstrip("/")

    # verification_video lives in its own bucket; everything else in documents.
    # (Video is uploaded during onboarding, before the WorkerProfile row exists,
    # so /upload/verification-video can't attach it yet — the frontend calls
    # this endpoint afterwards, once the profile is created, to register it.)
    bucket = BUCKET_VERIFICATION_VIDEO if document_type == "verification_video" else BUCKET_DOCUMENTS
    bucket_marker = f"/storage/v1/object/public/{bucket}/"
    if not document_path and bucket_marker in document_url:
        document_path = document_url.split(f"/{bucket}/", 1)[1]
    if document_path and bucket_marker not in document_url:
        document_url = get_public_url(bucket, document_path)
    if bucket_marker not in document_url:
        raise HTTPException(400, f"Document URL must point to the {bucket} bucket")

    if not document_path:
        raise HTTPException(400, "Invalid document payload")
    if not document_path.startswith(f"{user.id}/"):
        raise HTTPException(403, "Document path does not belong to current user")

    # Replace any existing verification video record for this worker
    if document_type == "verification_video":
        existing = await db.execute(
            select(WorkerDocument).where(
                WorkerDocument.worker_id == wp.id,
                WorkerDocument.type == "verification_video",
            )
        )
        old = existing.scalar_one_or_none()
        if old:
            await db.delete(old)
            await db.flush()

    doc = WorkerDocument(
        worker_id=wp.id,
        type=document_type,
        cloudinary_url=document_url,
        cloudinary_id=document_path,
        file_size_kb=body.file_size_kb,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("/me/profile", response_model=WorkerProfileResponse)
async def get_my_profile_alias(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Alias for GET /profile — frontend uses this path."""
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")
    return wp


@router.get("/me/status")
async def get_my_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkerProfile.status).where(WorkerProfile.user_id == user.id)
    )
    status = result.scalar_one_or_none()
    return {"status": status or "offline"}


@router.get("/me/media")
async def get_my_media(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")
    media_result = await db.execute(
        select(ServiceMedia)
        .where(ServiceMedia.worker_id == wp.id)
        .order_by(ServiceMedia.sort_order, ServiceMedia.created_at.desc())
    )
    return [
        {
            "id": str(m.id),
            "type": m.type,
            "url": m.cloudinary_url,
            "thumbnail_url": m.thumbnail_url,
            "caption": m.caption,
            "is_featured": m.is_featured,
            "view_count": m.view_count,
            "sort_order": m.sort_order,
            "created_at": m.created_at.isoformat(),
        }
        for m in media_result.scalars().all()
    ]


@router.get("/me/services", response_model=list[ServiceResponse])
async def get_my_services(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")
    svcs_result = await db.execute(select(Service).where(Service.worker_id == wp.id))
    svcs = svcs_result.scalars().all()

    # Attach tags to each service
    from schemas import TagResponse as TR
    responses = []
    for svc in svcs:
        tags_result = await db.execute(
            select(Tag).join(ServiceTag, ServiceTag.tag_id == Tag.id)
            .where(ServiceTag.service_id == svc.id)
        )
        tags = tags_result.scalars().all()
        resp = ServiceResponse.model_validate(svc)
        resp.tags = [TR.model_validate(t) for t in tags]
        responses.append(resp)
    return responses


@router.post("/me/services", response_model=ServiceResponse)
async def create_service(
    body: ServiceCreate,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")
        
    # Get the payload as a dictionary, ignoring None values
    dump = body.model_dump(exclude_none=True)
    
    # Auto-assign the worker's primary category if frontend didn't send it
    if "category_id" not in dump:
        from models import WorkerCategory
        cat_result = await db.execute(
            select(WorkerCategory.category_id).where(WorkerCategory.worker_id == wp.id).limit(1)
        )
        cat_id = cat_result.scalar_one_or_none()
        if not cat_id:
            raise HTTPException(400, "Worker has no categories assigned. Update profile first.")
        dump["category_id"] = cat_id

    # ── Price floor enforcement ───────────────────────────────────────────────
    from models import Category as CatModel
    from decimal import Decimal as _Dec
    _cat_id = dump.get("category_id")
    if _cat_id:
        cat_row = await db.execute(select(CatModel).where(CatModel.id == _cat_id))
        cat_obj = cat_row.scalar_one_or_none()
        if cat_obj and cat_obj.min_price is not None:
            _price = _Dec(str(dump.get("price", 0)))
            if _price < cat_obj.min_price:
                raise HTTPException(
                    400,
                    f"Minimum price for {cat_obj.name} is ₹{cat_obj.min_price}. "
                    f"You entered ₹{_price}."
                )

    svc = Service(worker_id=wp.id, **dump)
    db.add(svc)
    await db.commit()
    await db.refresh(svc)

    # Translate title + description to hi & mr in background (no latency)
    fields = {}
    if svc.title:       fields["title"] = svc.title
    if svc.description: fields["description"] = svc.description
    if fields:
        background.add_task(translate_and_store, db, "service", str(svc.id), fields)

    return svc

@router.patch("/me/services/{service_id}", response_model=ServiceResponse)
async def update_service(
    service_id: uuid.UUID,
    body: ServiceUpdate,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")
    svc_result = await db.execute(
        select(Service).where(Service.id == service_id, Service.worker_id == wp.id)
    )
    svc = svc_result.scalar_one_or_none()
    if not svc:
        raise HTTPException(404, "Service not found")
    updates = body.model_dump(exclude_none=True)

    # ── Price floor enforcement on update ─────────────────────────────────────
    if "price" in updates:
        from models import Category as CatModel
        from decimal import Decimal as _Dec
        _cat_id = updates.get("category_id") or svc.category_id
        if _cat_id:
            cat_row = await db.execute(select(CatModel).where(CatModel.id == _cat_id))
            cat_obj = cat_row.scalar_one_or_none()
            if cat_obj and cat_obj.min_price is not None:
                _price = _Dec(str(updates["price"]))
                if _price < cat_obj.min_price:
                    raise HTTPException(
                        400,
                        f"Minimum price for {cat_obj.name} is ₹{cat_obj.min_price}. "
                        f"You entered ₹{_price}."
                    )

    for k, v in updates.items():
        setattr(svc, k, v)
    await db.commit()
    await db.refresh(svc)

    # Re-translate if title or description changed
    fields = {}
    if "title" in updates:       fields["title"] = svc.title
    if "description" in updates: fields["description"] = svc.description
    if fields:
        background.add_task(translate_and_store, db, "service", str(svc.id), fields)

    return svc


@router.delete("/me/services/{service_id}", response_model=SuccessResponse)
async def delete_service(
    service_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")
    svc_result = await db.execute(
        select(Service).where(Service.id == service_id, Service.worker_id == wp.id)
    )
    svc = svc_result.scalar_one_or_none()
    if not svc:
        raise HTTPException(404, "Service not found")
    await db.delete(svc)
    await db.commit()
    return SuccessResponse(message="Service deleted")


# ── TAGS ──────────────────────────────────────────────────────

@router.get("/tags", response_model=list[TagResponse])
async def list_tags(
    q: Optional[str] = Query(None, max_length=80),
    category_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Public — list all tags, optionally filtered by name prefix or category."""
    from sqlalchemy import func, or_
    stmt = select(Tag)
    if q:
        stmt = stmt.where(Tag.name.ilike(f"%{q}%"))
    if category_id:
        stmt = stmt.where(Tag.category_id == category_id)
    stmt = stmt.order_by(Tag.usage_count.desc(), Tag.name).limit(50)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/tags", response_model=TagResponse, status_code=201)
async def create_tag(
    body: TagCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new tag (auto-slugify). Returns existing if slug already exists."""
    import re
    slug = re.sub(r"[^a-z0-9]+", "-", body.name.lower().strip()).strip("-")
    # Return existing if same slug
    existing = await db.execute(select(Tag).where(Tag.slug == slug))
    tag = existing.scalar_one_or_none()
    if tag:
        return tag
    tag = Tag(name=body.name.strip(), slug=slug)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.put("/me/services/{service_id}/tags", response_model=ServiceResponse)
async def set_service_tags(
    service_id: uuid.UUID,
    body: ServiceTagsSet,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Replace all tags on a service. Creates new tags on-the-fly from new_tag_names."""
    import re
    from sqlalchemy import delete as sa_delete, func

    # Auth: service must belong to this worker
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")
    svc_result = await db.execute(
        select(Service).where(Service.id == service_id, Service.worker_id == wp.id)
    )
    svc = svc_result.scalar_one_or_none()
    if not svc:
        raise HTTPException(404, "Service not found")

    # Collect all tag IDs (existing + newly created)
    all_tag_ids: list[uuid.UUID] = list(body.tag_ids)

    for name in body.new_tag_names:
        name = name.strip()
        if not name:
            continue
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        ex = await db.execute(select(Tag).where(Tag.slug == slug))
        tag = ex.scalar_one_or_none()
        if not tag:
            tag = Tag(name=name, slug=slug)
            db.add(tag)
            await db.flush()
        all_tag_ids.append(tag.id)

    # Replace all service_tags rows for this service
    await db.execute(sa_delete(ServiceTag).where(ServiceTag.service_id == service_id))
    for tag_id in set(all_tag_ids):
        db.add(ServiceTag(service_id=service_id, tag_id=tag_id))
        # Bump usage_count
        await db.execute(
            Tag.__table__.update()
            .where(Tag.id == tag_id)
            .values(usage_count=Tag.usage_count + 1)
        )

    await db.commit()

    # Return enriched service with tags populated
    tags_result = await db.execute(
        select(Tag)
        .join(ServiceTag, ServiceTag.tag_id == Tag.id)
        .where(ServiceTag.service_id == service_id)
    )
    tags = tags_result.scalars().all()
    await db.refresh(svc)
    # Manually attach tags to response (SQLAlchemy doesn't lazy-load in async)
    resp = ServiceResponse.model_validate(svc)
    from schemas import TagResponse as TR
    resp.tags = [TR.model_validate(t) for t in tags]
    return resp


@router.get("/me/analytics", response_model=WorkerAnalyticsResponse)
async def get_analytics(
    period: str = Query("today", pattern="^(today|week|month|all)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp_result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    wp = wp_result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")

    # Compute acceptance rate straight from dispatch history rather than
    # trusting the stored wp.acceptance_rate column, which defaults to 1.0
    # (100%) at profile creation and, historically, was never recomputed —
    # so a brand-new worker with zero offers would show a false 100%.
    # jobs_offered=0 lets the frontend show "No data yet" instead of a rate.
    from models import JobWorkerRequest
    resolved_result = await db.execute(
        select(JobWorkerRequest.status)
        .where(JobWorkerRequest.worker_id == wp.id, JobWorkerRequest.status != "pending")
    )
    statuses = [row[0] for row in resolved_result.all()]
    jobs_offered = len(statuses)
    acceptance_rate = (
        Decimal(sum(1 for s in statuses if s == "accepted")) / Decimal(jobs_offered)
        if jobs_offered > 0 else None
    )

    result = await db.execute(
        select(WorkerAnalytics).where(WorkerAnalytics.worker_id == wp.id)
    )
    analytics = result.scalar_one_or_none()
    if not analytics:
        return WorkerAnalyticsResponse(
            total_earnings=Decimal("0"),
            total_jobs=0,
            month_earnings=Decimal("0"),
            month_jobs=0,
            week_earnings=Decimal("0"),
            week_jobs=0,
            today_earnings=Decimal("0"),
            today_jobs=0,
            avg_job_value=Decimal("0"),
            avg_rating=wp.avg_rating,
            total_reviews=wp.rating_count,
            acceptance_rate=acceptance_rate,
            jobs_offered=jobs_offered,
        )
    # Enrich analytics with live profile fields not stored in analytics table
    return WorkerAnalyticsResponse(
        total_earnings=analytics.total_earnings,
        total_jobs=analytics.total_jobs,
        month_earnings=analytics.month_earnings,
        month_jobs=analytics.month_jobs,
        week_earnings=analytics.week_earnings,
        week_jobs=analytics.week_jobs,
        today_earnings=analytics.today_earnings,
        today_jobs=analytics.today_jobs,
        avg_job_value=analytics.avg_job_value,
        avg_rating=wp.avg_rating,
        total_reviews=wp.rating_count,
        acceptance_rate=acceptance_rate,
        jobs_offered=jobs_offered,
    )


# ═══════════════════════════════════════════════════════════
# PACKAGES — worker management
# ═══════════════════════════════════════════════════════════

async def _get_worker_profile(user: User, db: AsyncSession) -> WorkerProfile:
    """Helper: get worker profile or raise 404."""
    result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")
    return wp


def _serialize_package(pkg: Package) -> dict:
    items = []
    for item in (pkg.items or []):
        svc = item.service
        items.append({
            "service_id": str(item.service_id),
            "quantity": item.quantity,
            "redeem_type": item.redeem_type,
            "service": {
                "id": str(svc.id),
                "title": svc.title,
                "price": float(svc.price),
                "service_mode": svc.service_mode,
                "visit_fee": float(svc.visit_fee) if svc.visit_fee else None,
            } if svc else None,
        })
    return {
        "id": str(pkg.id),
        "worker_id": str(pkg.worker_id),
        "title": pkg.title,
        "description": pkg.description,
        "original_price": float(pkg.original_price),
        "discounted_price": float(pkg.discounted_price),
        "redemption_type": pkg.redemption_type,
        "validity_days": pkg.validity_days,
        "is_active": pkg.is_active,
        "valid_from": pkg.valid_from.isoformat() if pkg.valid_from else None,
        "valid_until": pkg.valid_until.isoformat() if pkg.valid_until else None,
        "total_bookings": pkg.total_bookings,
        "created_at": pkg.created_at.isoformat(),
        "items": items,
    }


@router.get("/me/packages")
async def get_my_packages(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp = await _get_worker_profile(user, db)
    result = await db.execute(
        select(Package)
        .where(Package.worker_id == wp.id)
        .order_by(Package.created_at.desc())
    )
    pkgs = result.scalars().all()
    # Eager-load items
    for pkg in pkgs:
        await db.refresh(pkg, ["items"])
        for item in pkg.items:
            await db.refresh(item, ["service"])
    return [_serialize_package(p) for p in pkgs]


@router.post("/me/packages")
async def create_package(
    body: PackageCreate,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp = await _get_worker_profile(user, db)

    # Verify all services belong to this worker
    for item in body.items:
        svc_result = await db.execute(
            select(Service).where(Service.id == item.service_id, Service.worker_id == wp.id)
        )
        if not svc_result.scalar_one_or_none():
            raise HTTPException(400, f"Service {item.service_id} not found in your catalog")

    pkg = Package(
        worker_id=wp.id,
        title=body.title,
        description=body.description,
        original_price=body.original_price,
        discounted_price=body.discounted_price,
        redemption_type=body.redemption_type,
        validity_days=body.validity_days,
        valid_from=body.valid_from,
        valid_until=body.valid_until,
    )
    db.add(pkg)
    await db.flush()

    for item in body.items:
        db.add(PackageServiceModel(
            package_id=pkg.id,
            service_id=item.service_id,
            quantity=item.quantity,
            redeem_type=item.redeem_type,
        ))

    await db.commit()
    await db.refresh(pkg, ["items"])
    for item in pkg.items:
        await db.refresh(item, ["service"])

    # Translate title + description in background
    fields = {}
    if pkg.title:       fields["title"] = pkg.title
    if pkg.description: fields["description"] = pkg.description
    if fields:
        background.add_task(translate_and_store, db, "package", str(pkg.id), fields)

    return _serialize_package(pkg)


@router.patch("/me/packages/{package_id}")
async def update_package(
    package_id: uuid.UUID,
    body: PackageUpdate,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp = await _get_worker_profile(user, db)
    result = await db.execute(
        select(Package).where(Package.id == package_id, Package.worker_id == wp.id)
    )
    pkg = result.scalar_one_or_none()
    if not pkg:
        raise HTTPException(404, "Package not found")

    updates = body.model_dump(exclude_none=True, exclude={"items"})
    for k, v in updates.items():
        setattr(pkg, k, v)

    # Re-sync items if provided
    if body.items is not None:
        # Delete existing
        existing = await db.execute(
            select(PackageServiceModel).where(PackageServiceModel.package_id == pkg.id)
        )
        for item in existing.scalars().all():
            await db.delete(item)
        await db.flush()
        # Re-add
        for item in body.items:
            svc_result = await db.execute(
                select(Service).where(Service.id == item.service_id, Service.worker_id == wp.id)
            )
            if not svc_result.scalar_one_or_none():
                raise HTTPException(400, f"Service {item.service_id} not found")
            db.add(PackageServiceModel(
                package_id=pkg.id,
                service_id=item.service_id,
                quantity=item.quantity,
                redeem_type=item.redeem_type,
            ))

    await db.commit()
    await db.refresh(pkg, ["items"])
    for item in pkg.items:
        await db.refresh(item, ["service"])

    # Re-translate if title or description changed
    fields = {}
    if "title" in updates:       fields["title"] = pkg.title
    if "description" in updates: fields["description"] = pkg.description
    if fields:
        background.add_task(translate_and_store, db, "package", str(pkg.id), fields)

    return _serialize_package(pkg)


@router.delete("/me/packages/{package_id}", response_model=SuccessResponse)
async def delete_package(
    package_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp = await _get_worker_profile(user, db)
    result = await db.execute(
        select(Package).where(Package.id == package_id, Package.worker_id == wp.id)
    )
    pkg = result.scalar_one_or_none()
    if not pkg:
        raise HTTPException(404, "Package not found")
    await db.delete(pkg)
    await db.commit()
    return SuccessResponse(message="Package deleted")


# ═══════════════════════════════════════════════════════════
# OFFERS — worker management
# ═══════════════════════════════════════════════════════════

@router.get("/me/offers", response_model=list[OfferResponse])
async def get_my_offers(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp = await _get_worker_profile(user, db)
    result = await db.execute(
        select(Offer)
        .where(Offer.worker_id == wp.id)
        .order_by(Offer.created_at.desc())
    )
    return result.scalars().all()


@router.post("/me/offers", response_model=OfferResponse)
async def create_offer(
    body: OfferCreate,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp = await _get_worker_profile(user, db)

    # Validate service/package ownership
    if body.service_id:
        svc = await db.execute(
            select(Service).where(Service.id == body.service_id, Service.worker_id == wp.id)
        )
        if not svc.scalar_one_or_none():
            raise HTTPException(400, "Service not found in your catalog")
    if body.package_id:
        pkg = await db.execute(
            select(Package).where(Package.id == body.package_id, Package.worker_id == wp.id)
        )
        if not pkg.scalar_one_or_none():
            raise HTTPException(400, "Package not found in your catalog")

    offer = Offer(
        worker_id=wp.id,
        service_id=body.service_id,
        package_id=body.package_id,
        title=body.title,
        description=body.description,
        discount_type=body.discount_type,
        discount_value=body.discount_value,
        min_order_value=body.min_order_value,
        promo_code=body.promo_code,
        valid_until=body.valid_until,
        usage_limit=body.usage_limit,
    )
    db.add(offer)
    await db.commit()
    await db.refresh(offer)

    # Translate title + description in background
    fields = {}
    if offer.title:       fields["title"] = offer.title
    if offer.description: fields["description"] = offer.description
    if fields:
        background.add_task(translate_and_store, db, "offer", str(offer.id), fields)

    return offer


@router.patch("/me/offers/{offer_id}", response_model=OfferResponse)
async def update_offer(
    offer_id: uuid.UUID,
    body: OfferUpdate,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp = await _get_worker_profile(user, db)
    result = await db.execute(
        select(Offer).where(Offer.id == offer_id, Offer.worker_id == wp.id)
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise HTTPException(404, "Offer not found")
    updates = body.model_dump(exclude_none=True)
    for k, v in updates.items():
        setattr(offer, k, v)
    await db.commit()
    await db.refresh(offer)

    # Re-translate if title or description changed
    fields = {}
    if "title" in updates:       fields["title"] = offer.title
    if "description" in updates: fields["description"] = offer.description
    if fields:
        background.add_task(translate_and_store, db, "offer", str(offer.id), fields)

    return offer


@router.delete("/me/offers/{offer_id}", response_model=SuccessResponse)
async def delete_offer(
    offer_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp = await _get_worker_profile(user, db)
    result = await db.execute(
        select(Offer).where(Offer.id == offer_id, Offer.worker_id == wp.id)
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise HTTPException(404, "Offer not found")
    await db.delete(offer)
    await db.commit()
    return SuccessResponse(message="Offer deleted")


# ═══════════════════════════════════════════════════════════
# PACKAGE ORDERS — user purchases + tracking
# ═══════════════════════════════════════════════════════════

@router.post("/packages/{package_id}/order")
async def purchase_package(
    package_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """User purchases a package — creates a PackageOrder."""
    result = await db.execute(
        select(Package).where(Package.id == package_id, Package.is_active == True)  # noqa: E712
    )
    pkg = result.scalar_one_or_none()
    if not pkg:
        raise HTTPException(404, "Package not found or inactive")

    from datetime import datetime, timezone, timedelta
    expires_at = None
    if pkg.validity_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=pkg.validity_days)

    order = PackageOrder(
        user_id=user.id,
        package_id=pkg.id,
        worker_id=pkg.worker_id,
        status="active",
        total_paid=pkg.discounted_price,
        expires_at=expires_at,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return {
        "id": str(order.id),
        "package_id": str(order.package_id),
        "worker_id": str(order.worker_id),
        "status": order.status,
        "total_paid": float(order.total_paid),
        "expires_at": order.expires_at.isoformat() if order.expires_at else None,
        "purchased_at": order.purchased_at.isoformat(),
    }


@router.get("/me/package-orders")
async def get_my_package_orders(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all package orders for the current user."""
    result = await db.execute(
        select(PackageOrder)
        .where(PackageOrder.user_id == user.id)
        .order_by(PackageOrder.purchased_at.desc())
    )
    orders = result.scalars().all()

    out = []
    for order in orders:
        await db.refresh(order, ["package", "usages"])
        if order.package:
            await db.refresh(order.package, ["items"])
            for item in order.package.items:
                await db.refresh(item, ["service"])

        # Count usages per service
        usage_map: dict = {}
        for usage in order.usages:
            sid = str(usage.service_id)
            usage_map[sid] = usage_map.get(sid, 0) + 1

        items_with_remaining = []
        if order.package:
            for item in order.package.items:
                sid = str(item.service_id)
                used = usage_map.get(sid, 0)
                remaining = max(0, item.quantity - used)
                svc = item.service
                items_with_remaining.append({
                    "service_id": sid,
                    "service_title": svc.title if svc else "Unknown",
                    "quantity": item.quantity,
                    "used": used,
                    "remaining": remaining,
                    "redeem_type": item.redeem_type,
                })

        from datetime import datetime, timezone, timedelta
        days_remaining = None
        if order.expires_at:
            delta = order.expires_at - datetime.now(timezone.utc)
            days_remaining = max(0, delta.days)

        out.append({
            "id": str(order.id),
            "package_id": str(order.package_id),
            "worker_id": str(order.worker_id),
            "status": order.status,
            "total_paid": float(order.total_paid),
            "expires_at": order.expires_at.isoformat() if order.expires_at else None,
            "days_remaining": days_remaining,
            "purchased_at": order.purchased_at.isoformat(),
            "package_title": order.package.title if order.package else None,
            "items": items_with_remaining,
        })
    return out


@router.get("/me/package-orders/{order_id}")
async def get_package_order(
    order_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PackageOrder).where(PackageOrder.id == order_id, PackageOrder.user_id == user.id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Order not found")

    await db.refresh(order, ["package", "usages"])
    if order.package:
        await db.refresh(order.package, ["items"])
        for item in order.package.items:
            await db.refresh(item, ["service"])

    usages_out = [
        {"id": str(u.id), "service_id": str(u.service_id), "job_id": str(u.job_id) if u.job_id else None, "used_at": u.used_at.isoformat()}
        for u in order.usages
    ]

    from datetime import datetime, timezone
    days_remaining = None
    if order.expires_at:
        delta = order.expires_at - datetime.now(timezone.utc)
        days_remaining = max(0, delta.days)

    return {
        "id": str(order.id),
        "package_id": str(order.package_id),
        "worker_id": str(order.worker_id),
        "status": order.status,
        "total_paid": float(order.total_paid),
        "expires_at": order.expires_at.isoformat() if order.expires_at else None,
        "days_remaining": days_remaining,
        "purchased_at": order.purchased_at.isoformat(),
        "package": _serialize_package(order.package) if order.package else None,
        "usages": usages_out,
    }


# ═══════════════════════════════════════════════════════════
# PUBLIC ROUTES — dynamic /{worker_id} MUST come last
# ═══════════════════════════════════════════════════════════

@router.get("/{worker_id}", response_model=WorkerPublicResponse)
async def get_worker(worker_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(WorkerProfile, User)
        .join(User, User.id == WorkerProfile.user_id)
        .where(WorkerProfile.id == worker_id)
        .where(WorkerProfile.verification_status == "approved")
    )
    row = result.first()
    if not row:
        raise HTTPException(404, "Worker not found")
    wp, u = row
    data = WorkerPublicResponse.model_validate(wp)
    data.full_name = u.full_name
    data.avatar_url = u.avatar_url
    # Populate expanded public fields
    data.status = wp.status
    data.verification_status = wp.verification_status
    data.max_rate = wp.max_rate
    data.is_instant_available = wp.is_instant_available
    data.is_discovery_available = wp.is_discovery_available
    data.allow_multi_day_booking = getattr(wp, "allow_multi_day_booking", False)
    # Rating breakdowns (if columns exist on the model)
    data.quality_rating = getattr(wp, "quality_rating", None)
    data.punctuality_rating = getattr(wp, "punctuality_rating", None)
    data.communication_rating = getattr(wp, "communication_rating", None)
    data.value_rating = getattr(wp, "value_rating", None)
    # Service mode — derive from worker's is_instant_available / is_discovery_available
    # or from a direct service_mode field if it exists
    data.service_mode = getattr(wp, "service_mode", None)
    return data


@router.post("/me/reapply", response_model=SuccessResponse)
async def reapply_for_verification(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Rejected workers can resubmit their profile for admin review.
    Resets verification_status back to 'pending' and clears the rejection reason.
    """
    result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")
    if wp.verification_status == "approved":
        raise HTTPException(400, "Your account is already approved")
    if wp.verification_status == "pending":
        raise HTTPException(400, "Your application is already under review")
    # Only rejected workers reach here
    wp.verification_status = "pending"
    wp.rejection_reason = None
    await db.commit()
    return SuccessResponse(message="Reapplication submitted — we'll review your profile shortly")


@router.get("/{worker_id}/packages")
async def get_worker_packages(worker_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Package).where(Package.worker_id == worker_id, Package.is_active == True)  # noqa: E712
    )
    pkgs = result.scalars().all()
    for pkg in pkgs:
        await db.refresh(pkg, ["items"])
        for item in pkg.items:
            await db.refresh(item, ["service"])
    return [_serialize_package(p) for p in pkgs]


@router.get("/{worker_id}/offers", response_model=list[OfferResponse])
async def get_worker_offers(worker_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    from datetime import datetime, timezone
    result = await db.execute(
        select(Offer).where(
            Offer.worker_id == worker_id,
            Offer.is_active == True,  # noqa: E712
            Offer.valid_until > datetime.now(timezone.utc),
        )
    )
    return result.scalars().all()


@router.get("/{worker_id}/services", response_model=list[ServiceResponse])
async def get_worker_services(worker_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Service)
        .where(Service.worker_id == worker_id, Service.is_active == True)  # noqa: E712
        .order_by(Service.avg_rating.desc(), Service.created_at)
    )
    svcs = result.scalars().all()
    # Attach tags to each service (avoids async lazy-load errors)
    from schemas import TagResponse as TR
    responses = []
    for svc in svcs:
        tags_result = await db.execute(
            select(Tag).join(ServiceTag, ServiceTag.tag_id == Tag.id)
            .where(ServiceTag.service_id == svc.id)
        )
        tags = tags_result.scalars().all()
        resp = ServiceResponse.model_validate(svc)
        resp.tags = [TR.model_validate(t) for t in tags]
        responses.append(resp)
    return responses


@router.get("/{worker_id}/media")
async def get_worker_media(worker_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ServiceMedia)
        .where(ServiceMedia.worker_id == worker_id)
        .order_by(ServiceMedia.sort_order, ServiceMedia.created_at.desc())
    )
    return [
        {
            "id": str(m.id),
            "type": m.type,
            "url": m.cloudinary_url,
            "thumbnail_url": m.thumbnail_url,
            "caption": m.caption,
            "is_featured": m.is_featured,
            "view_count": m.view_count,
            "sort_order": m.sort_order,
            "created_at": m.created_at.isoformat(),
        }
        for m in result.scalars().all()
    ]


@router.get("/{worker_id}/reviews")
async def get_worker_reviews(
    worker_id: uuid.UUID,
    page: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
):
    from models import Review
    limit = 20
    offset = (page - 1) * limit
    result = await db.execute(
        select(Review, User.full_name)
        .join(User, User.id == Review.reviewer_id)
        .where(Review.worker_id == worker_id, Review.is_visible == True)  # noqa: E712
        .order_by(Review.created_at.desc())
        .offset(offset).limit(limit)
    )
    rows = result.all()
    return [
        {
            "id": str(review.id),
            "job_id": str(review.job_id),
            "reviewer_id": str(review.reviewer_id),
            "worker_id": str(review.worker_id),
            "reviewer_name": reviewer_name,
            "rating": review.rating,
            "text": review.text,
            "reply": review.reply,
            "created_at": review.created_at.isoformat(),
        }
        for review, reviewer_name in rows
    ]


# ── WORKER AVAILABILITY ───────────────────────────────────────────────────────

@router.get("/me/availability", response_model=list[WorkerAvailabilityResponse])
async def get_my_availability(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all 7 day-of-week availability entries for the current worker."""
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")

    result = await db.execute(
        select(WorkerAvailability)
        .where(WorkerAvailability.worker_id == wp.id)
        .order_by(WorkerAvailability.day_of_week)
    )
    avails = result.scalars().all()

    # If no rows seeded yet, return defaults (all days 09:00–21:00, open)
    from datetime import time as _time
    if not avails:
        return [
            WorkerAvailabilityResponse(
                id=uuid.uuid4(),
                worker_id=wp.id,
                day_of_week=d,
                start_time=_time(9, 0),
                end_time=_time(21, 0),
                is_open=True,
                updated_at=__import__('datetime').datetime.utcnow(),
            )
            for d in range(7)
        ]
    return avails


@router.put("/me/availability", response_model=list[WorkerAvailabilityResponse])
async def set_availability(
    payload: list[WorkerAvailabilitySet],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upsert availability for one or more days.
    Send all 7 days to replace the full weekly schedule.
    """
    from datetime import time as _time, datetime as _dt
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")

    updated = []
    for item in payload:
        result = await db.execute(
            select(WorkerAvailability).where(
                WorkerAvailability.worker_id == wp.id,
                WorkerAvailability.day_of_week == item.day_of_week,
            )
        )
        avail = result.scalar_one_or_none()
        t_start = _time.fromisoformat(item.start_time)
        t_end   = _time.fromisoformat(item.end_time)

        if avail:
            avail.start_time = t_start
            avail.end_time   = t_end
            avail.is_open    = item.is_open
            avail.updated_at = _dt.utcnow()
        else:
            avail = WorkerAvailability(
                worker_id   = wp.id,
                day_of_week = item.day_of_week,
                start_time  = t_start,
                end_time    = t_end,
                is_open     = item.is_open,
            )
            db.add(avail)
        updated.append(avail)

    await db.commit()
    for a in updated:
        await db.refresh(a)
    return updated


# ── WORKER TIME-OFF ───────────────────────────────────────────────────────────

@router.get("/me/time-off", response_model=list[WorkerTimeOffResponse])
async def get_my_time_off(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404)

    from datetime import datetime as _dt, timezone as _tz
    result = await db.execute(
        select(WorkerTimeOff)
        .where(
            WorkerTimeOff.worker_id == wp.id,
            WorkerTimeOff.end_datetime >= _dt.now(_tz.utc),
        )
        .order_by(WorkerTimeOff.start_datetime)
    )
    return result.scalars().all()


@router.post("/me/time-off", response_model=WorkerTimeOffResponse, status_code=201)
async def create_time_off(
    payload: WorkerTimeOffCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404)

    toff = WorkerTimeOff(
        worker_id      = wp.id,
        start_datetime = payload.start_datetime,
        end_datetime   = payload.end_datetime,
        reason         = payload.reason,
    )
    db.add(toff)
    await db.commit()
    await db.refresh(toff)
    return toff


@router.delete("/me/time-off/{toff_id}", response_model=SuccessResponse)
async def delete_time_off(
    toff_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404)

    result = await db.execute(
        select(WorkerTimeOff).where(
            WorkerTimeOff.id == toff_id,
            WorkerTimeOff.worker_id == wp.id,
        )
    )
    toff = result.scalar_one_or_none()
    if not toff:
        raise HTTPException(404, "Time-off record not found")

    await db.delete(toff)
    await db.commit()
    return SuccessResponse(message="Deleted")


# ── WORKER SCHEDULE BLOCKS (read-only — created by scheduler) ─────────────────

@router.get("/me/schedule", response_model=list[WorkerScheduleBlockResponse])
async def get_my_schedule(
    days_ahead: int = Query(7, ge=1, le=30),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return upcoming schedule blocks for the next N days."""
    from datetime import date as _date
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404)

    today = _date.today()
    until = today + __import__('datetime').timedelta(days=days_ahead)

    result = await db.execute(
        select(WorkerScheduleBlock)
        .where(
            WorkerScheduleBlock.worker_id == wp.id,
            WorkerScheduleBlock.date >= today,
            WorkerScheduleBlock.date <= until,  # noqa
        )
        .order_by(WorkerScheduleBlock.date, WorkerScheduleBlock.window_start)
    )
    return result.scalars().all()


# ── SLOT MANAGEMENT (migration 007) ──────────────────────────────────────────
# These endpoints let workers configure and manage time slots for slot-based services.

def _require_worker(user: User, db) -> None:
    """Helper used inline when we already have wp."""
    pass  # wp check done inline below


async def _get_wp(user: User, db: AsyncSession) -> WorkerProfile:
    """Get worker profile or raise 404."""
    result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")
    return wp


# ── Slot config CRUD ──────────────────────────────────────────────────────────

@router.get("/me/services/{service_id}/slot-config", response_model=SlotConfigResponse)
async def get_slot_config(
    service_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get slot configuration for a service."""
    wp = await _get_wp(user, db)
    result = await db.execute(
        select(ServiceSlotConfig)
        .where(ServiceSlotConfig.service_id == service_id, ServiceSlotConfig.worker_id == wp.id)
    )
    cfg = result.scalar_one_or_none()
    if not cfg:
        raise HTTPException(404, "No slot config for this service")
    return cfg


@router.put("/me/services/{service_id}/slot-config", response_model=SlotConfigResponse)
async def upsert_slot_config(
    service_id: uuid.UUID,
    body: SlotConfigCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create or update slot configuration for a service. Also enables requires_slot on the service."""
    wp = await _get_wp(user, db)

    # Verify service belongs to worker
    svc_result = await db.execute(
        select(Service).where(Service.id == service_id, Service.worker_id == wp.id)
    )
    svc = svc_result.scalar_one_or_none()
    if not svc:
        raise HTTPException(404, "Service not found")

    # Upsert config
    cfg_result = await db.execute(
        select(ServiceSlotConfig)
        .where(ServiceSlotConfig.service_id == service_id, ServiceSlotConfig.worker_id == wp.id)
    )
    cfg = cfg_result.scalar_one_or_none()

    if cfg:
        cfg.slot_duration_min = body.slot_duration_min
        cfg.buffer_min        = body.buffer_min
        cfg.capacity          = body.capacity
        cfg.max_slots_per_day = body.max_slots_per_day
        cfg.auto_generate     = body.auto_generate
    else:
        cfg = ServiceSlotConfig(
            service_id        = service_id,
            worker_id         = wp.id,
            slot_duration_min = body.slot_duration_min,
            buffer_min        = body.buffer_min,
            capacity          = body.capacity,
            max_slots_per_day = body.max_slots_per_day,
            auto_generate     = body.auto_generate,
        )
        db.add(cfg)

    # Enable slot mode on the service
    svc.requires_slot      = True
    svc.slot_duration_min  = body.slot_duration_min
    svc.max_slots_per_day  = body.max_slots_per_day

    await db.commit()
    await db.refresh(cfg)
    return cfg


# ── View / generate slots ─────────────────────────────────────────────────────

@router.get("/me/services/{service_id}/slots", response_model=list[SlotResponse])
async def get_my_slots(
    service_id: uuid.UUID,
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date:   str = Query(..., description="YYYY-MM-DD"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all slots for a service in a date range (worker view)."""
    from datetime import date as _date
    wp = await _get_wp(user, db)
    fd = _date.fromisoformat(from_date)
    td = _date.fromisoformat(to_date)

    result = await db.execute(
        select(ServiceSlot)
        .where(
            ServiceSlot.worker_id  == wp.id,
            ServiceSlot.service_id == service_id,
            ServiceSlot.slot_date  >= fd,
            ServiceSlot.slot_date  <= td,
        )
        .order_by(ServiceSlot.slot_date, ServiceSlot.slot_start)
    )
    return result.scalars().all()


@router.post("/me/services/{service_id}/slots/generate", response_model=list[SlotResponse])
async def generate_slots(
    service_id: uuid.UUID,
    body: SlotGenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Auto-generate slots from worker_availability + slot_config for a date range.
    Skips days already seeded. Respects max_slots_per_day and buffer_min.
    """
    from datetime import date as _date, timedelta, time as _time
    wp = await _get_wp(user, db)

    # Get slot config
    cfg_result = await db.execute(
        select(ServiceSlotConfig)
        .where(ServiceSlotConfig.service_id == service_id, ServiceSlotConfig.worker_id == wp.id)
    )
    cfg = cfg_result.scalar_one_or_none()
    if not cfg:
        raise HTTPException(400, "Configure slot settings first (PUT /slot-config)")

    # Get worker availability (recurring weekly schedule)
    avail_result = await db.execute(
        select(WorkerAvailability).where(WorkerAvailability.worker_id == wp.id, WorkerAvailability.is_open == True)
    )
    availability = {row.day_of_week: row for row in avail_result.scalars().all()}

    created: list[ServiceSlot] = []
    current = body.from_date
    slot_dur = cfg.slot_duration_min
    buffer   = cfg.buffer_min
    capacity = cfg.capacity

    while current <= body.to_date:
        dow = current.weekday()  # 0=Mon
        if dow in availability:
            av = availability[dow]
            cursor_min = av.start_time.hour * 60 + av.start_time.minute
            end_min    = av.end_time.hour   * 60 + av.end_time.minute
            slots_today = 0

            while cursor_min + slot_dur <= end_min and slots_today < cfg.max_slots_per_day:
                start_h, start_m = divmod(cursor_min, 60)
                end_h,   end_m   = divmod(cursor_min + slot_dur, 60)
                slot_start = _time(start_h, start_m)
                slot_end   = _time(end_h,   end_m)

                existing = await db.execute(
                    select(ServiceSlot).where(
                        ServiceSlot.worker_id  == wp.id,
                        ServiceSlot.service_id == service_id,
                        ServiceSlot.slot_date  == current,
                        ServiceSlot.slot_start == slot_start,
                    )
                )
                if not existing.scalar_one_or_none():
                    slot = ServiceSlot(
                        service_id   = service_id,
                        worker_id    = wp.id,
                        slot_date    = current,
                        slot_start   = slot_start,
                        slot_end     = slot_end,
                        capacity     = capacity,
                        booked_count = 0,
                    )
                    db.add(slot)
                    created.append(slot)

                cursor_min += slot_dur + buffer
                slots_today += 1

        current += timedelta(days=1)

    await db.commit()
    for s in created:
        await db.refresh(s)
    return created


@router.patch("/me/services/{service_id}/slots/{slot_id}/block", response_model=SlotResponse)
async def block_slot(
    service_id: uuid.UUID,
    slot_id:    uuid.UUID,
    reason: str = Query("Blocked by worker"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Block a slot so it can't be booked."""
    wp = await _get_wp(user, db)
    result = await db.execute(
        select(ServiceSlot).where(ServiceSlot.id == slot_id, ServiceSlot.worker_id == wp.id)
    )
    slot = result.scalar_one_or_none()
    if not slot:
        raise HTTPException(404)
    slot.is_blocked   = True
    slot.block_reason = reason[:100]
    await db.commit()
    await db.refresh(slot)
    return slot


@router.patch("/me/services/{service_id}/slots/{slot_id}/unblock", response_model=SlotResponse)
async def unblock_slot(
    service_id: uuid.UUID,
    slot_id:    uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Unblock a slot, making it bookable again."""
    wp = await _get_wp(user, db)
    result = await db.execute(
        select(ServiceSlot).where(ServiceSlot.id == slot_id, ServiceSlot.worker_id == wp.id)
    )
    slot = result.scalar_one_or_none()
    if not slot:
        raise HTTPException(404)
    slot.is_blocked   = False
    slot.block_reason = None
    await db.commit()
    await db.refresh(slot)
    return slot


# ── Public: available slots for a specific service (for customers booking) ──
@router.get("/{worker_id}/services/{service_id}/slots", response_model=list[SlotResponse])
async def get_public_service_slots(
    worker_id:  uuid.UUID,
    service_id: uuid.UUID,
    date_from:  str | None = None,
    date_to:    str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Return available (non-blocked, not fully booked) slots for a service.
    Used by BookDiscoveryPage when a customer selects a time slot.
    """
    from datetime import date as _date
    today = _date.today()

    # Parse optional date filters (YYYY-MM-DD)
    try:
        d_from = _date.fromisoformat(date_from) if date_from else today
    except ValueError:
        d_from = today
    try:
        d_to = _date.fromisoformat(date_to) if date_to else None
    except ValueError:
        d_to = None

    stmt = (
        select(ServiceSlot)
        .where(
            ServiceSlot.service_id == service_id,
            ServiceSlot.worker_id  == worker_id,
            ServiceSlot.slot_date  >= d_from,
            ServiceSlot.is_blocked == False,  # noqa: E712
        )
    )
    if d_to:
        stmt = stmt.where(ServiceSlot.slot_date <= d_to)

    stmt = stmt.order_by(ServiceSlot.slot_date, ServiceSlot.slot_start)

    result = await db.execute(stmt)
    slots  = result.scalars().all()

    # Filter out fully booked slots
    return [s for s in slots if s.booked_count < s.capacity]
