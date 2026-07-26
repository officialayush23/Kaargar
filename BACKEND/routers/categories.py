import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

from database import get_db
from models import Category, PuneArea, ServiceCatalog, Service, WorkerProfile
from schemas import CategoryResponse, PuneAreaResponse, ServiceCatalogResponse
from services.config import get_config
from typing import Optional

router = APIRouter()


@router.get("/pricing-info")
async def get_pricing_info(db: AsyncSession = Depends(get_db)):
    """
    Public, non-sensitive pricing constants used to render an honest price
    breakdown on the client (NewJobPage's Estimate step) — real platform-fee
    and GST rates, sourced from platform_config with the same fallback
    defaults services/matching.calc_commission uses, instead of the
    frontend fabricating its own numbers (which is what caused a permanent,
    unconditional "15% surge" to render for every single instant booking —
    it was never actually demand-driven, just a hardcoded multiplier).
    """
    commission_instant_rate = await get_config(db, "commission_instant_rate", Decimal("0.12"))
    gst_rate = await get_config(db, "gst_rate", Decimal("0.18"))
    return {
        "commission_instant_rate": float(commission_instant_rate),
        "gst_rate": float(gst_rate),
    }


@router.get("", response_model=list[CategoryResponse])
async def list_categories(
    mode: Optional[str] = Query(None, pattern="^(instant|discovery|both)$"),
    db: AsyncSession = Depends(get_db),
):
    q = select(Category).where(Category.is_active == True).order_by(Category.sort_order)
    if mode:
        q = q.where((Category.mode == mode) | (Category.mode == "both"))
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/areas", response_model=list[PuneAreaResponse])
async def list_areas(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PuneArea).where(PuneArea.is_active == True).order_by(PuneArea.name)
    )
    return result.scalars().all()


@router.get("/{category_id}/services", response_model=list[ServiceCatalogResponse])
async def list_category_services(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Public: the curated, admin-approved service list for one profession
    (category) — the Instant-mode "profession -> service" step. Ranked by
    total_bookings desc (how often it's actually been availed across all
    workers), tiebreak by sort_order/name. Each entry carries a
    representative photo pulled from an offering worker's ServiceMedia
    (never a generic icon when a real photo exists), a worker_count so the
    UI can show "no one nearby offers this yet" states, and a min_price
    across current offering workers.

    Deliberately does NOT hide zero-worker entries: during the worker-
    onboarding growth phase, showing the full intended catalog (even before
    any worker has opted into a given service) is the point — it signals to
    customers "this app does this" and gives them a reason to check back,
    rather than making Instant mode look sparse/empty for services that are
    genuinely coming soon. The "no one nearby offers this yet" state on the
    frontend is what communicates the gap honestly instead of silently
    hiding it. (Reverted an earlier change that filtered these out — kept
    here as a note since the "hide it" version is an easy regression to
    reintroduce by accident.)
    """
    cat = await db.scalar(select(Category).where(Category.id == category_id))
    if not cat:
        raise HTTPException(404, "Category not found")

    entries_result = await db.execute(
        select(ServiceCatalog)
        .where(
            ServiceCatalog.category_id == category_id,
            ServiceCatalog.status == "approved",
            ServiceCatalog.is_active == True,
        )
        .order_by(ServiceCatalog.total_bookings.desc(), ServiceCatalog.sort_order, ServiceCatalog.name)
    )
    entries = entries_result.scalars().all()
    if not entries:
        return []

    entry_ids = [e.id for e in entries]

    # Aggregate min_price + worker_count per catalog service, across active
    # services belonging to approved workers.
    agg_rows = (await db.execute(
        select(
            Service.catalog_service_id,
            func.min(Service.price).label("min_price"),
            func.count(Service.id).label("worker_count"),
        )
        .join(WorkerProfile, WorkerProfile.id == Service.worker_id)
        .where(
            Service.catalog_service_id.in_(entry_ids),
            Service.is_active == True,
            WorkerProfile.verification_status == "approved",
        )
        .group_by(Service.catalog_service_id)
    )).all()
    agg_map = {row.catalog_service_id: row for row in agg_rows}

    # One representative photo per catalog service — prefer a featured photo,
    # then any thumbnail/photo, from any offering worker's ServiceMedia.
    photo_rows = (await db.execute(text("""
        SELECT DISTINCT ON (s.catalog_service_id)
            s.catalog_service_id,
            COALESCE(sm.thumbnail_url, sm.cloudinary_url) AS photo_url
        FROM services s
        JOIN service_media sm ON sm.service_id = s.id
        JOIN worker_profiles wp ON wp.id = s.worker_id
        WHERE s.catalog_service_id = ANY(:entry_ids)
          AND s.is_active = true
          AND wp.verification_status = 'approved'
          AND sm.type = 'image'
        ORDER BY s.catalog_service_id, sm.is_featured DESC, sm.sort_order, sm.created_at DESC
    """), {"entry_ids": entry_ids})).all()
    photo_map = {row.catalog_service_id: row.photo_url for row in photo_rows}

    out = []
    for e in entries:
        resp = ServiceCatalogResponse.model_validate(e)
        agg = agg_map.get(e.id)
        resp.worker_count = int(agg.worker_count) if agg else 0
        # Real market price (cheapest current worker) when anyone offers it;
        # falls back to the admin-set base_price so a brand-new catalog
        # service still shows a price instead of blank, before any worker
        # has opted in yet.
        resp.min_price = agg.min_price if agg else e.base_price
        resp.photo_url = photo_map.get(e.id) or e.icon_url
        out.append(resp)
    return out
