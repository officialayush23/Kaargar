"""
Workers router — profile CRUD, status, location, services, analytics.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from typing import Optional
from decimal import Decimal
import uuid

from database import get_db
from models import User, WorkerProfile, WorkerCategory, WorkerAnalytics, Service, ServiceMedia
from schemas import (
    WorkerProfileCreate, WorkerProfileUpdate, WorkerProfileResponse,
    WorkerPublicResponse, WorkerStatusUpdate, WorkerLocationUpdate,
    WorkerDocumentResponse, DocumentUpload, ServiceCreate, ServiceUpdate,
    ServiceResponse, WorkerAnalyticsResponse, SuccessResponse,
)
from dependencies import get_current_user, require_worker

router = APIRouter()


# ── Public endpoints ──────────────────────────────────────────

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


@router.get("/{worker_id}/services", response_model=list[ServiceResponse])
async def get_worker_services(worker_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Service)
        .where(Service.worker_id == worker_id, Service.is_active == True)
    )
    return result.scalars().all()


@router.get("/{worker_id}/media")
async def get_worker_media(worker_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ServiceMedia)
        .where(ServiceMedia.worker_id == worker_id)
        .order_by(ServiceMedia.sort_order, ServiceMedia.created_at.desc())
    )
    media = result.scalars().all()
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
        for m in media
    ]


@router.get("/{worker_id}/reviews")
async def get_worker_reviews(
    worker_id: uuid.UUID,
    page: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
):
    from models import Review, User as ReviewUser
    limit = 20
    offset = (page - 1) * limit
    result = await db.execute(
        select(Review)
        .where(Review.worker_id == worker_id, Review.is_visible == True)
        .order_by(Review.created_at.desc())
        .offset(offset).limit(limit)
    )
    return result.scalars().all()


# ── Worker self endpoints ─────────────────────────────────────

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
        raise HTTPException(404, "Worker profile not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(wp, field, value)
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
        raise HTTPException(404)
    wp.status = body.status
    await db.commit()
    return SuccessResponse(message=f"Status set to {body.status}")


@router.post("/location", response_model=SuccessResponse)
async def update_location(
    body: WorkerLocationUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Rate limit via Redis
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
        raise HTTPException(404)

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
        raise HTTPException(404)

    from models import WorkerDocument
    doc = WorkerDocument(
        worker_id=wp.id,
        type=body.type,
        cloudinary_url=body.cloudinary_url,
        cloudinary_id=body.cloudinary_id,
        file_size_kb=body.file_size_kb,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


# ── Worker services CRUD ──────────────────────────────────────

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
        raise HTTPException(404)
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
        raise HTTPException(404)
    svc = Service(worker_id=wp.id, **body.model_dump())
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
        raise HTTPException(404)
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
        raise HTTPException(404)
    svc_result = await db.execute(
        select(Service).where(Service.id == service_id, Service.worker_id == wp.id)
    )
    svc = svc_result.scalar_one_or_none()
    if not svc:
        raise HTTPException(404)
    await db.delete(svc)
    await db.commit()
    return SuccessResponse(message="Service deleted")


@router.get("/me/analytics", response_model=WorkerAnalyticsResponse)
async def get_analytics(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp_result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    wp = wp_result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404)

    result = await db.execute(
        select(WorkerAnalytics).where(WorkerAnalytics.worker_id == wp.id)
    )
    analytics = result.scalar_one_or_none()
    if not analytics:
        # Return zeros if no analytics yet
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
        )
    return analytics
