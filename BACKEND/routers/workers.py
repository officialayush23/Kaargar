"""
Workers router.

IMPORTANT: All static-path routes (/profile, /me/*, /status, /location, /documents)
MUST be declared before the dynamic /{worker_id} route, otherwise FastAPI matches
/{worker_id} first and treats the literal string as a UUID — causing 404/422 errors.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
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
)
from schemas import (
    WorkerProfileCreate, WorkerProfileUpdate, WorkerProfileResponse,
    WorkerPublicResponse, WorkerStatusUpdate, WorkerLocationUpdate,
    WorkerDocumentResponse, DocumentUpload, ServiceCreate, ServiceUpdate,
    ServiceResponse, WorkerAnalyticsResponse, SuccessResponse,
    PackageCreate, PackageUpdate, PackageResponse, PackageItemResponse,
    OfferCreate, OfferUpdate, OfferResponse,
    PackageOrderCreate, PackageOrderResponse, PackageUsageResponse,
)
from dependencies import get_current_user
from services.storage import get_public_url, BUCKET_DOCUMENTS

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
    for field, value in updates.items():
        setattr(wp, field, value)

    # Also allow updating full_name on the user record
    if hasattr(body, 'full_name') and body.full_name:  # type: ignore[attr-defined]
        user_result = await db.execute(select(User).where(User.id == user.id))
        u = user_result.scalar_one_or_none()
        if u:
            u.full_name = body.full_name  # type: ignore[attr-defined]

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

    bucket_marker = f"/storage/v1/object/public/{BUCKET_DOCUMENTS}/"
    if not document_path and bucket_marker in document_url:
        document_path = document_url.split(f"/{BUCKET_DOCUMENTS}/", 1)[1]
    if document_path and bucket_marker not in document_url:
        document_url = get_public_url(BUCKET_DOCUMENTS, document_path)
    if bucket_marker not in document_url:
        raise HTTPException(400, "Document URL must point to documents bucket")

    if not document_path:
        raise HTTPException(400, "Invalid document payload")
    if not document_path.startswith(f"{user.id}/"):
        raise HTTPException(403, "Document path does not belong to current user")

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
    svcs = await db.execute(select(Service).where(Service.worker_id == wp.id))
    return svcs.scalars().all()


@router.post("/me/services", response_model=ServiceResponse)
async def create_service(
    body: ServiceCreate,
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

    svc = Service(worker_id=wp.id, **dump)
    db.add(svc)
    await db.commit()
    await db.refresh(svc)
    return svc

@router.patch("/me/services/{service_id}", response_model=ServiceResponse)
async def update_service(
    service_id: uuid.UUID,
    body: ServiceUpdate,
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
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(svc, k, v)
    await db.commit()
    await db.refresh(svc)
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
            acceptance_rate=wp.acceptance_rate,
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
        acceptance_rate=wp.acceptance_rate,
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
    return _serialize_package(pkg)


@router.patch("/me/packages/{package_id}")
async def update_package(
    package_id: uuid.UUID,
    body: PackageUpdate,
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
    return offer


@router.patch("/me/offers/{offer_id}", response_model=OfferResponse)
async def update_offer(
    offer_id: uuid.UUID,
    body: OfferUpdate,
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
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(offer, k, v)
    await db.commit()
    await db.refresh(offer)
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
    )
    row = result.first()
    if not row:
        raise HTTPException(404, "Worker not found")
    wp, u = row
    data = WorkerPublicResponse.model_validate(wp)
    data.full_name = u.full_name
    data.avatar_url = u.avatar_url
    return data


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
    )
    return result.scalars().all()


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
