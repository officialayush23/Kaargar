"""
Workers router.

IMPORTANT: All static-path routes (/profile, /me/*, /status, /location, /documents)
MUST be declared before the dynamic /{worker_id} route, otherwise FastAPI matches
/{worker_id} first and treats the literal string as a UUID — causing 404/422 errors.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from typing import Optional
from decimal import Decimal
import uuid

logger = logging.getLogger(__name__)

from database import get_db
from models import (
    User, WorkerProfile, WorkerCategory, WorkerAnalytics, Service, ServiceMedia,
    Package, PackageService as PackageServiceModel, Offer, PackageOrder,
    WorkerAvailability, WorkerTimeOff, WorkerScheduleBlock,
    ServiceSlotConfig, ServiceSlot, Tag, ServiceTag, ServiceCatalog,
    PuneArea, WorkerArea, WorkerDocument,
)
from schemas import (
    WorkerProfileCreate, WorkerProfileUpdate, WorkerProfileResponse, WorkerOnboardingPublish,
    WorkerPublicResponse, WorkerStatusUpdate, WorkerLocationUpdate,
    WorkerDocumentResponse, DocumentUpload, ServiceCreate, ServiceUpdate,
    ServiceResponse, WorkerAnalyticsResponse, SuccessResponse,
    PackageCreate, PackageUpdate, PackageResponse,
    OfferCreate, OfferUpdate, OfferResponse,
    PackageOrderCreate,
    WorkerAvailabilitySet, WorkerAvailabilityResponse,
    WorkerTimeOffCreate, WorkerTimeOffResponse, WorkerScheduleBlockResponse,
    SlotConfigCreate, SlotConfigResponse, SlotResponse, SlotGenerateRequest,
    TagResponse, TagCreate, ServiceTagsSet,
    ServiceCatalogResponse, WorkerAreaSet,
)
from dependencies import get_current_user, require_approved_worker, require_worker
from services.storage import get_signed_url, BUCKET_DOCUMENTS, BUCKET_VERIFICATION_VIDEO
from services.translation import translate_and_store
from services.config import get_config

router = APIRouter()


@router.get("/support-contact")
async def get_worker_support_contact():
    """Public: dedicated worker-registration support phone number, shown as
    a persistent call button on the onboarding wizard. Sourced from
    WORKER_SUPPORT_PHONE (config.py) instead of being hardcoded in the
    frontend."""
    from config import get_settings
    return {"phone": get_settings().worker_support_phone}


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
    body: WorkerOnboardingPublish,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Publish a worker profile — ATOMICALLY, including services, Instant coverage
    areas and the weekly schedule.

    WHY THIS TAKES EVERYTHING AT ONCE
    ---------------------------------
    Onboarding used to be four sequential calls from the client: create the
    profile, then set areas, then POST each service, then set availability.
    Every call after the first could fail independently, and the client wrapped
    them in empty `catch {}` blocks — so a worker saw "Profile published!" while
    their services, coverage areas and schedule silently saved nothing.

    Making the client report those failures more honestly would have been the
    wrong fix. "We saved your profile but not your services, please re-enter
    them" is still data loss, just politely announced. The right fix is that a
    partial outcome cannot happen: one request, one transaction. If any part is
    invalid, NOTHING is written and the worker is told which field to correct
    while they are still in the wizard looking at it.

    Backwards compatible: every new field defaults to empty, so the web
    frontend's existing profile-only payload behaves exactly as before.
    """
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
    # Categories must be visible to _build_service's "you can only list a
    # service under a profession you've registered for" check, which queries
    # WorkerCategory. They're in this transaction but not yet flushed.
    await db.flush()

    # ── Instant coverage areas ────────────────────────────────────────────
    if body.instant_area_ids:
        valid_ids = set((await db.execute(
            select(PuneArea.id).where(
                PuneArea.id.in_(body.instant_area_ids), PuneArea.is_active == True
            )
        )).scalars().all())
        if len(valid_ids) != len(set(body.instant_area_ids)):
            raise HTTPException(400, "One or more coverage areas are invalid or inactive")
        for area_id in set(body.instant_area_ids):
            db.add(WorkerArea(worker_id=wp.id, area_id=area_id))

    # ── Services ──────────────────────────────────────────────────────────
    # Errors from _build_service are already worker-readable ("Minimum price
    # for Fan Repair is Rs 250. You entered Rs 180."). Prefixing with the
    # service name so the wizard can point at the right row when several are
    # being published at once.
    built_services: list[Service] = []
    for item in body.services:
        try:
            built_services.append(await _build_service(db, wp, item))
        except HTTPException as exc:
            label = (item.title or "service").strip()
            raise HTTPException(exc.status_code, f"{label}: {exc.detail}") from exc

    # ── Identity documents + intro video ──────────────────────────────────
    # Files are already in Storage; this is what makes them VISIBLE to admin.
    # Bucket is inferred from the type so the signed-URL lookup in
    # routers/admin.py resolves against the right one.
    for doc in body.documents:
        doc_type = (doc.type or "").strip().lower()
        if not doc_type or not doc.cloudinary_id:
            continue
        db.add(WorkerDocument(
            worker_id=wp.id,
            type=doc_type,
            cloudinary_url=doc.cloudinary_url,
            cloudinary_id=doc.cloudinary_id.lstrip("/"),
            file_size_kb=doc.file_size_kb,
        ))

    # ── Weekly availability ───────────────────────────────────────────────
    from datetime import time as _time
    for item in body.availability:
        try:
            t_start = _time.fromisoformat(item.start_time)
            t_end = _time.fromisoformat(item.end_time)
        except ValueError:
            raise HTTPException(400, f"Invalid time on day {item.day_of_week}")
        db.add(WorkerAvailability(
            worker_id=wp.id,
            day_of_week=item.day_of_week,
            start_time=t_start,
            end_time=t_end,
            is_open=item.is_open,
        ))

    await db.commit()
    await db.refresh(wp)

    for svc in built_services:
        await db.refresh(svc)
        _queue_service_translation(background, svc)

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
    # The Dashboard's online/offline toggle is the ONLY switch a worker sees,
    # and its own copy says "You will receive new job requests" — so it must
    # actually make them eligible for instant dispatch. Previously this only
    # flipped `status`, while the dispatch query in services/matching.py
    # additionally requires `is_instant_available = true`, a separate column
    # that nothing here ever set. That silently meant NO worker who went
    # "online" via this toggle was ever dispatchable, since the only other
    # place is_instant_available could be set was a rarely-visited manual
    # toggle buried in Profile settings. Auto-sync it with online/offline so
    # there's one clear source of truth: online == instant-dispatchable.
    wp.is_instant_available = (body.status == "online")
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
    # Both buckets are private (signed URLs only, see services/storage.py) —
    # document_path is the real source of truth and is what's actually
    # persisted; the URL is always re-derived fresh below rather than trusted
    # from the client, since a signed URL carries a token + expiry that may
    # already be stale by the time this request lands.
    bucket = BUCKET_VERIFICATION_VIDEO if document_type == "verification_video" else BUCKET_DOCUMENTS
    if not document_path and document_url:
        for marker in (f"/object/sign/{bucket}/", f"/object/public/{bucket}/"):
            if marker in document_url:
                document_path = document_url.split(f"/{bucket}/", 1)[1].split("?", 1)[0]
                break

    if not document_path:
        raise HTTPException(400, "Invalid document payload")
    if not document_path.startswith(f"{user.id}/"):
        raise HTTPException(403, "Document path does not belong to current user")

    document_url = get_signed_url(bucket, document_path)

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
    resp = WorkerProfileResponse.model_validate(wp)
    area_rows = (await db.execute(
        select(WorkerArea.area_id).where(WorkerArea.worker_id == wp.id)
    )).scalars().all()
    resp.area_ids = list(area_rows)
    return resp


@router.get("/me/areas")
async def get_my_areas(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The named Pune areas this worker currently serves for Instant dispatch
    (migration 017) — full PuneArea objects, not just ids, so the frontend
    can render names without a second lookup."""
    wp = (await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )).scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")

    areas = (await db.execute(
        select(PuneArea)
        .join(WorkerArea, WorkerArea.area_id == PuneArea.id)
        .where(WorkerArea.worker_id == wp.id)
        .order_by(PuneArea.name)
    )).scalars().all()
    return areas


@router.put("/me/areas", response_model=WorkerAreaSet)
async def set_my_areas(
    body: WorkerAreaSet,
    user: User = Depends(require_worker),
    db: AsyncSession = Depends(get_db),
):
    """Full-replacement set of areas a worker serves. Strictly enforced at
    Instant dispatch time (services/matching.py::_resolve_area_id) — a job
    whose location resolves to an area not in this list is never offered to
    this worker, regardless of physical distance. An empty list is valid and
    means zero Instant jobs until the worker picks at least one area."""
    wp = (await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )).scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")

    if body.area_ids:
        valid_ids = set((await db.execute(
            select(PuneArea.id).where(PuneArea.id.in_(body.area_ids), PuneArea.is_active == True)
        )).scalars().all())
        if len(valid_ids) != len(set(body.area_ids)):
            raise HTTPException(400, "One or more area ids are invalid or inactive")

    await db.execute(delete(WorkerArea).where(WorkerArea.worker_id == wp.id))
    for area_id in set(body.area_ids):
        db.add(WorkerArea(worker_id=wp.id, area_id=area_id))
    await db.commit()
    return WorkerAreaSet(area_ids=list(set(body.area_ids)))


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
            # Was missing entirely — without it, the frontend has no way to
            # tell which photos belong to which of the worker's services,
            # so a per-service photo (uploaded via WorkerPostUpload's
            # optional serviceId) couldn't be filtered/displayed anywhere
            # except the general portfolio grid.
            "service_id": str(m.service_id) if m.service_id else None,
            "created_at": m.created_at.isoformat(),
        }
        for m in media_result.scalars().all()
    ]


@router.get("/service-catalog", response_model=list[ServiceCatalogResponse])
async def worker_list_service_catalog(
    category_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Worker-facing catalog browse for onboarding/Services page: the
    admin-curated, Instant-eligible services under a category. Purely
    read-only — a worker can never add to this list themselves (that's what
    plain free-text POST /workers/me/services is for; those surface in
    Discover immediately, no review needed). No worker profile required —
    usable during onboarding before POST /workers/profile has run.
    """
    q = (
        select(ServiceCatalog)
        .where(ServiceCatalog.category_id == category_id, ServiceCatalog.is_active == True)
        .order_by(ServiceCatalog.total_bookings.desc(), ServiceCatalog.sort_order, ServiceCatalog.name)
    )
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/me/available-catalog-services", response_model=list[ServiceCatalogResponse])
async def worker_available_catalog_services(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Instant-mode catalog services the current worker is eligible for (i.e.
    under a profession they're registered for via WorkerCategory) but hasn't
    opted into yet (no active Service row linking to them). Powers the
    Services page's "New Instant services available" opt-in section for
    already-onboarded workers — this is the ongoing counterpart to the
    onboarding-time ServicesStep, since a worker who joined before a new
    catalog service existed would otherwise never see it again.
    """
    wp = await _get_worker_profile(user, db)

    cat_ids = (await db.execute(
        select(WorkerCategory.category_id).where(WorkerCategory.worker_id == wp.id)
    )).scalars().all()
    if not cat_ids:
        return []

    linked_ids = (await db.execute(
        select(Service.catalog_service_id)
        .where(Service.worker_id == wp.id, Service.catalog_service_id.isnot(None))
    )).scalars().all()

    q = (
        select(ServiceCatalog)
        .where(
            ServiceCatalog.category_id.in_(cat_ids),
            ServiceCatalog.is_active == True,
        )
        .order_by(ServiceCatalog.total_bookings.desc(), ServiceCatalog.sort_order, ServiceCatalog.name)
    )
    if linked_ids:
        q = q.where(ServiceCatalog.id.notin_(linked_ids))
    result = await db.execute(q)
    return result.scalars().all()


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


async def _build_service(db: AsyncSession, wp: WorkerProfile, body: ServiceCreate) -> Service:
    """
    Validate a service payload and return an unsaved `Service` attached to `wp`.

    DOES NOT COMMIT — the caller owns the transaction. That is the whole point:
    `POST /me/services` commits one service, while onboarding's atomic publish
    (`POST /profile`) builds several of these plus areas and availability and
    commits them together, so a worker can never end up half-published.

    Extracted rather than duplicated because this carries four separate
    integrity rules (profession ownership, catalog/category match, price floor,
    mutually-exclusive booking modes). A second copy of that in the onboarding
    path would drift, and the failure mode of drift here is a worker being
    dispatched for a profession they were never verified for.
    """
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

    # ── A worker can only list a service under a category they've actually
    # registered for ── without this, category_id was previously trusted
    # from the client entirely, so a worker could list (and get dispatched
    # for, via the category-fallback matching path) a category they were
    # never verified/onboarded for.
    from models import Category as CatModel
    from decimal import Decimal as _Dec
    _cat_id = dump.get("category_id")
    if _cat_id:
        from models import WorkerCategory as WC
        has_cat = await db.scalar(
            select(WC.worker_id).where(WC.worker_id == wp.id, WC.category_id == _cat_id).limit(1)
        )
        if not has_cat:
            raise HTTPException(400, "You can only add services under a profession you've registered for.")

    # ── Catalog link integrity ─────────────────────────────────────────────────
    # catalog_service_id is what makes a listing Instant-eligible — it must
    # point at an active catalog entry under the SAME category as the
    # service itself. Without this check, a client could link any service to
    # any catalog entry regardless of category (e.g. a plumber's listing
    # linked to an "AC repair" Instant entry), which services/matching.py's
    # catalog-driven dispatch path would otherwise trust.
    _catalog_id = dump.get("catalog_service_id")
    cat_svc = None
    if _catalog_id:
        from models import ServiceCatalog as SC
        cat_svc = await db.scalar(select(SC).where(SC.id == _catalog_id))
        if not cat_svc or not cat_svc.is_active:
            raise HTTPException(404, "Catalog service not found or inactive")
        if str(cat_svc.category_id) != str(_cat_id):
            raise HTTPException(400, "That service belongs to a different profession than this listing.")

    # ── Price floor enforcement ───────────────────────────────────────────────
    # A specific catalog service's own base_price (migration 014) is a more
    # precise floor than the whole profession's — e.g. Electrician's blanket
    # min_price shouldn't gate "full home rewiring" the same as "bulb change".
    # Falls back to the category's min_price when the catalog entry has none
    # set, or when this is a plain free-text (non-catalog) listing.
    _floor = cat_svc.base_price if (cat_svc and cat_svc.base_price is not None) else None
    _floor_label = cat_svc.name if _floor is not None else None
    if _floor is None and _cat_id:
        cat_row = await db.execute(select(CatModel).where(CatModel.id == _cat_id))
        cat_obj = cat_row.scalar_one_or_none()
        if cat_obj and cat_obj.min_price is not None:
            _floor = cat_obj.min_price
            _floor_label = cat_obj.name
    if _floor is not None:
        _price = _Dec(str(dump.get("price", 0)))
        if _price < _floor:
            raise HTTPException(
                400,
                f"Minimum price for {_floor_label} is ₹{_floor}. You entered ₹{_price}."
            )

    # ── Booking mode: slot-based and multi-day are mutually exclusive ─────────
    # requires_slot=True → strict per-slot booking (salon-style).
    # allow_multi_day_booking=True → flexible multi-day window booking.
    # A service is one or the other, never both.
    if dump.get("requires_slot") and dump.get("allow_multi_day_booking"):
        raise HTTPException(
            400,
            "A service can't be both slot-based (requires_slot) and multi-day "
            "bookable (allow_multi_day_booking) — choose one booking mode.",
        )

    # ── Auto-recompute slot_duration_min from duration_min (+ buffer) ─────────
    # for slot-mode services, regardless of whatever the client sent.
    if dump.get("requires_slot") and dump.get("duration_min") is not None:
        slot_buffer_min = int(await get_config(db, "slot_duration_buffer_min", 60))
        dump["slot_duration_min"] = dump["duration_min"] + slot_buffer_min

    svc = Service(worker_id=wp.id, **dump)
    db.add(svc)
    return svc


def _queue_service_translation(background: BackgroundTasks, svc: Service) -> None:
    """Translate title + description to hi & mr in background (no latency)."""
    fields = {}
    if svc.title:       fields["title"] = svc.title
    if svc.description: fields["description"] = svc.description
    if fields:
        background.add_task(translate_and_store, "service", str(svc.id), fields)


@router.post("/me/services", response_model=ServiceResponse)
async def create_service(
    body: ServiceCreate,
    background: BackgroundTasks,
    user: User = Depends(require_worker),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")

    svc = await _build_service(db, wp, body)
    await db.commit()
    await db.refresh(svc)
    _queue_service_translation(background, svc)
    return svc

@router.patch("/me/services/{service_id}", response_model=ServiceResponse)
async def update_service(
    service_id: uuid.UUID,
    body: ServiceUpdate,
    background: BackgroundTasks,
    user: User = Depends(require_worker),
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

    # ── Catalog link integrity on update (same invariant as create_service) ───
    # Resolve the FINAL catalog link — either the one being set in this
    # update, or the service's existing one if this update doesn't touch it —
    # so the price-floor check below can use its base_price either way.
    from models import ServiceCatalog as SC
    final_catalog_id = updates.get("catalog_service_id", svc.catalog_service_id)
    final_cat_id = updates.get("category_id", svc.category_id)

    # ── Profession guard on UPDATE ────────────────────────────────────────────
    # create_service already refuses a category the worker isn't registered
    # for, but this endpoint did NOT — it only validated the catalog link. So
    # the create-time guard was trivially bypassable: create the listing under
    # a category you ARE registered for, then PATCH category_id to any other
    # one. The category-fallback path in services/matching.py dispatches on
    # exactly this field, so the result is a worker receiving instant jobs for
    # a profession they were never verified or onboarded for.
    #
    # Only checked when the update actually changes the category — otherwise a
    # worker whose registration was revoked couldn't edit the price on an
    # existing listing, which is a separate concern (deactivation) and not
    # something to enforce via a field they didn't touch.
    if "category_id" in updates and str(updates["category_id"]) != str(svc.category_id):
        from models import WorkerCategory as WC
        has_cat = await db.scalar(
            select(WC.worker_id)
            .where(WC.worker_id == svc.worker_id, WC.category_id == updates["category_id"])
            .limit(1)
        )
        if not has_cat:
            raise HTTPException(400, "You can only list services under a profession you've registered for.")

    cat_svc = None
    if final_catalog_id:
        cat_svc = await db.scalar(select(SC).where(SC.id == final_catalog_id))
        if "catalog_service_id" in updates:
            if not cat_svc or not cat_svc.is_active:
                raise HTTPException(404, "Catalog service not found or inactive")
            if str(cat_svc.category_id) != str(final_cat_id):
                raise HTTPException(400, "That service belongs to a different profession than this listing.")

    # ── Price floor enforcement on update ─────────────────────────────────────
    # Same precedence as create_service: the linked catalog service's own
    # base_price first, falling back to the profession's min_price.
    if "price" in updates:
        from models import Category as CatModel
        from decimal import Decimal as _Dec
        _floor = cat_svc.base_price if (cat_svc and cat_svc.base_price is not None) else None
        _floor_label = cat_svc.name if _floor is not None else None
        if _floor is None and final_cat_id:
            cat_row = await db.execute(select(CatModel).where(CatModel.id == final_cat_id))
            cat_obj = cat_row.scalar_one_or_none()
            if cat_obj and cat_obj.min_price is not None:
                _floor = cat_obj.min_price
                _floor_label = cat_obj.name
        if _floor is not None:
            _price = _Dec(str(updates["price"]))
            if _price < _floor:
                raise HTTPException(
                    400,
                    f"Minimum price for {_floor_label} is ₹{_floor}. You entered ₹{_price}."
                )

    # ── Booking mode: slot-based and multi-day are mutually exclusive ─────────
    # Validate against the FINAL state (existing value unless overridden here).
    final_requires_slot = updates.get("requires_slot", svc.requires_slot)
    final_multi_day      = updates.get("allow_multi_day_booking", svc.allow_multi_day_booking)
    if final_requires_slot and final_multi_day:
        raise HTTPException(
            400,
            "A service can't be both slot-based (requires_slot) and multi-day "
            "bookable (allow_multi_day_booking) — choose one booking mode.",
        )

    # ── Auto-recompute slot_duration_min when duration_min changes ────────────
    # Buffer minutes, for slot-mode services. Overrides any
    # slot_duration_min the client tried to send directly.
    duration_changed = "duration_min" in updates and updates["duration_min"] is not None
    if final_requires_slot and duration_changed:
        slot_buffer_min = int(await get_config(db, "slot_duration_buffer_min", 60))
        updates["slot_duration_min"] = updates["duration_min"] + slot_buffer_min

    for k, v in updates.items():
        setattr(svc, k, v)
    await db.commit()
    await db.refresh(svc)

    # Re-translate if title or description changed
    fields = {}
    if "title" in updates:       fields["title"] = svc.title
    if "description" in updates: fields["description"] = svc.description
    if fields:
        background.add_task(translate_and_store, "service", str(svc.id), fields)

    # ── Keep slot config + generated slots in sync with the new duration ──────
    # If this service already has slot settings configured, mirror the
    # recomputed slot_duration_min into ServiceSlotConfig and re-trigger
    # generation so the rolling slot window reflects the new duration.
    if final_requires_slot and duration_changed:
        cfg_result = await db.execute(
            select(ServiceSlotConfig)
            .where(ServiceSlotConfig.service_id == svc.id, ServiceSlotConfig.worker_id == wp.id)
        )
        cfg = cfg_result.scalar_one_or_none()
        if cfg:
            cfg.slot_duration_min = svc.slot_duration_min
            await db.commit()
            await db.refresh(cfg)

            from datetime import date as _date, timedelta as _timedelta
            today = _date.today()
            background.add_task(
                _regenerate_slots_background, str(svc.id), str(wp.id), today, today + _timedelta(days=14)
            )

    return svc


async def _regenerate_slots_background(service_id_str: str, wp_id_str: str, from_date, to_date):
    """
    Background-task wrapper around _generate_slots_core — used when a
    slot-mode service's duration changes and we need to re-seed the slot
    window with a fresh DB session (FastAPI BackgroundTasks run after the
    request's own session has closed).
    """
    from database import async_session
    try:
        async with async_session() as db:
            cfg_result = await db.execute(
                select(ServiceSlotConfig).where(
                    ServiceSlotConfig.service_id == uuid.UUID(service_id_str),
                    ServiceSlotConfig.worker_id == uuid.UUID(wp_id_str),
                )
            )
            cfg = cfg_result.scalar_one_or_none()
            if not cfg:
                return
            await _generate_slots_core(
                db, uuid.UUID(wp_id_str), uuid.UUID(service_id_str), cfg, from_date, to_date
            )
    except Exception as exc:
        logger.error(f"[SLOTS] Failed to regenerate slots for service {service_id_str}: {exc}", exc_info=True)


@router.delete("/me/services/{service_id}", response_model=SuccessResponse)
async def delete_service(
    service_id: uuid.UUID,
    user: User = Depends(require_worker),
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
    user: User = Depends(require_approved_worker),
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
    user: User = Depends(require_worker),
    db: AsyncSession = Depends(get_db),
):
    """Replace all tags on a service. Creates new tags on-the-fly from new_tag_names."""
    import re
    from sqlalchemy import delete as sa_delete

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


@router.get("/me/instant-quota")
async def get_instant_quota(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Soft, no-penalty progress toward a daily/weekly/monthly count of
    completed Instant-mode jobs — a motivational showcase on the worker
    dashboard, never a gate on availability or earnings. Targets are
    DB-config-driven (platform_config) with hardcoded fallbacks, same
    pattern as services/matching.calc_commission.
    """
    from datetime import datetime, timezone, timedelta
    from models import Job as JobModel
    from services.config import get_config

    wp = await _get_worker_profile(user, db)

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    counts_row = (await db.execute(
        select(
            func.count(JobModel.id).filter(JobModel.completed_at >= today_start).label("today"),
            func.count(JobModel.id).filter(JobModel.completed_at >= week_start).label("week"),
            func.count(JobModel.id).filter(JobModel.completed_at >= month_start).label("month"),
        )
        .where(
            JobModel.worker_id == wp.id,
            JobModel.job_type == "instant",
            JobModel.status == "completed",
        )
    )).one()

    today_target = await get_config(db, "instant_quota_daily", 3)
    week_target = await get_config(db, "instant_quota_weekly", 15)
    month_target = await get_config(db, "instant_quota_monthly", 50)

    return {
        "today": {"completed": int(counts_row.today or 0), "target": today_target},
        "week": {"completed": int(counts_row.week or 0), "target": week_target},
        "month": {"completed": int(counts_row.month or 0), "target": month_target},
    }


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
    user: User = Depends(require_approved_worker),
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
        background.add_task(translate_and_store, "package", str(pkg.id), fields)

    return _serialize_package(pkg)


@router.patch("/me/packages/{package_id}")
async def update_package(
    package_id: uuid.UUID,
    body: PackageUpdate,
    background: BackgroundTasks,
    user: User = Depends(require_approved_worker),
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
        background.add_task(translate_and_store, "package", str(pkg.id), fields)

    return _serialize_package(pkg)


@router.delete("/me/packages/{package_id}", response_model=SuccessResponse)
async def delete_package(
    package_id: uuid.UUID,
    user: User = Depends(require_approved_worker),
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
    user: User = Depends(require_approved_worker),
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
        background.add_task(translate_and_store, "offer", str(offer.id), fields)

    return offer


@router.patch("/me/offers/{offer_id}", response_model=OfferResponse)
async def update_offer(
    offer_id: uuid.UUID,
    body: OfferUpdate,
    background: BackgroundTasks,
    user: User = Depends(require_approved_worker),
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
        background.add_task(translate_and_store, "offer", str(offer.id), fields)

    return offer


@router.delete("/me/offers/{offer_id}", response_model=SuccessResponse)
async def delete_offer(
    offer_id: uuid.UUID,
    user: User = Depends(require_approved_worker),
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
    # NOT a worker endpoint despite living in workers.py — this is a CUSTOMER
    # buying a worker's package. Gating it on worker approval would have
    # blocked every package purchase in the app.
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

        from datetime import datetime, timezone
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
    data.service_radius_km = wp.service_radius_km
    if wp.pune_area:
        from models import PuneArea
        from sqlalchemy import func as _f
        area = (await db.execute(
            select(PuneArea.lat, PuneArea.lon).where(_f.lower(PuneArea.name) == wp.pune_area.strip().lower()).limit(1)
        )).first()
        if area:
            data.area_lat, data.area_lon = float(area[0]), float(area[1])
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
            # Was missing entirely — without it, the frontend has no way to
            # tell which photos belong to which of the worker's services,
            # so a per-service photo (uploaded via WorkerPostUpload's
            # optional serviceId) couldn't be filtered/displayed anywhere
            # except the general portfolio grid.
            "service_id": str(m.service_id) if m.service_id else None,
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
    user: User = Depends(require_worker),
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
    user: User = Depends(require_approved_worker),
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
    user: User = Depends(require_approved_worker),
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
    user: User = Depends(require_approved_worker),
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


async def _generate_slots_core(
    db: AsyncSession,
    wp_id: uuid.UUID,
    service_id: uuid.UUID,
    cfg: "ServiceSlotConfig",
    from_date,
    to_date,
) -> list:
    """
    Core slot-generation logic — walks worker_availability in
    cfg.slot_duration_min increments (+ buffer_min) across [from_date, to_date],
    respecting cfg.max_slots_per_day, and skipping days/slots already seeded
    (idempotent — safe to call repeatedly / for overlapping ranges).

    Shared by:
      - POST /me/services/{service_id}/slots/generate (manual, worker-triggered)
      - tasks/slot_rollover.py (APScheduler — keeps a rolling ~14 day window seeded)

    Do not duplicate this loop elsewhere — reuse this function.
    """
    # NOTE: workers.py has no module-level datetime import — every function
    # imports what it needs locally. `timezone` is required here for the
    # time-off comparison below and is NOT in scope otherwise.
    from datetime import timedelta, time as _time, datetime as _datetime, timezone as _timezone

    # Worker's recurring weekly working hours
    avail_result = await db.execute(
        select(WorkerAvailability).where(WorkerAvailability.worker_id == wp_id, WorkerAvailability.is_open == True)
    )
    availability = {row.day_of_week: row for row in avail_result.scalars().all()}

    # ── Time off ─────────────────────────────────────────────────────────────
    # BUG FIX: this loop previously consulted only worker_availability (the
    # recurring weekly pattern) and ignored worker_time_off entirely. A worker
    # who booked leave still had bookable slots generated and SOLD on those
    # days — the customer could reserve a slot the worker had explicitly made
    # themselves unavailable for.
    #
    # services/scheduling.py already honours WorkerTimeOff when assigning
    # scheduled jobs, so slot generation was the odd one out. Fetch the ranges
    # overlapping this window once, then skip any day they cover.
    range_start_dt = _datetime.combine(from_date, _time.min).replace(tzinfo=_timezone.utc)
    range_end_dt   = _datetime.combine(to_date,   _time.max).replace(tzinfo=_timezone.utc)
    timeoff_result = await db.execute(
        select(WorkerTimeOff).where(
            WorkerTimeOff.worker_id == wp_id,
            WorkerTimeOff.start_datetime <= range_end_dt,
            WorkerTimeOff.end_datetime   >= range_start_dt,
        )
    )
    time_off = timeoff_result.scalars().all()

    def _is_day_off(day) -> bool:
        """True if any time-off range covers any part of this calendar day."""
        day_start = _datetime.combine(day, _time.min).replace(tzinfo=_timezone.utc)
        day_end   = _datetime.combine(day, _time.max).replace(tzinfo=_timezone.utc)
        return any(t.start_datetime <= day_end and t.end_datetime >= day_start for t in time_off)

    created: list = []
    current = from_date
    slot_dur = cfg.slot_duration_min
    buffer   = cfg.buffer_min
    capacity = cfg.capacity

    while current <= to_date:
        dow = current.weekday()  # 0=Mon
        if dow in availability and not _is_day_off(current):
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
                        ServiceSlot.worker_id  == wp_id,
                        ServiceSlot.service_id == service_id,
                        ServiceSlot.slot_date  == current,
                        ServiceSlot.slot_start == slot_start,
                    )
                )
                if not existing.scalar_one_or_none():
                    slot = ServiceSlot(
                        service_id   = service_id,
                        worker_id    = wp_id,
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


@router.post("/me/services/{service_id}/slots/generate", response_model=list[SlotResponse])
async def generate_slots(
    service_id: uuid.UUID,
    body: SlotGenerateRequest,
    user: User = Depends(require_approved_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    Auto-generate slots from worker_availability + slot_config for a date range.
    Skips days already seeded. Respects max_slots_per_day and buffer_min.
    """
    wp = await _get_wp(user, db)

    # Get slot config
    cfg_result = await db.execute(
        select(ServiceSlotConfig)
        .where(ServiceSlotConfig.service_id == service_id, ServiceSlotConfig.worker_id == wp.id)
    )
    cfg = cfg_result.scalar_one_or_none()
    if not cfg:
        raise HTTPException(400, "Configure slot settings first (PUT /slot-config)")

    return await _generate_slots_core(db, wp.id, service_id, cfg, body.start_date, body.end_date)


@router.patch("/me/services/{service_id}/slots/{slot_id}/block", response_model=SlotResponse)
async def block_slot(
    service_id: uuid.UUID,
    slot_id:    uuid.UUID,
    reason: str = Query("Blocked by worker"),
    user: User = Depends(require_approved_worker),
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
    user: User = Depends(require_approved_worker),
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

    # Drop full slots, past slots (in IST) and — shared timeline — any slot
    # that overlaps something else on the worker's day: a booking on another
    # service, a window/multi-day booking, a live instant job, time off or a
    # manual block. Previously only this service's own slot rows counted.
    from datetime import datetime as _dt, timedelta as _td
    from services.worker_calendar import build_timeline, find_conflict, now_ist
    open_slots = [s for s in slots if s.booked_count < s.capacity]
    if not open_slots:
        return []
    tl = await build_timeline(db, worker_id, open_slots[0].slot_date, open_slots[-1].slot_date)
    cutoff = now_ist() + _td(minutes=30)
    out = []
    for s in open_slots:
        st, en = _dt.combine(s.slot_date, s.slot_start), _dt.combine(s.slot_date, s.slot_end)
        if st < cutoff:
            continue
        hit = find_conflict(tl, st, en)
        # A slot's own bookings appear on the timeline too; with capacity > 1
        # those mustn't hide the slot while spots remain.
        if hit and not (hit.kind == "job" and s.capacity > 1 and hit.start == st):
            continue
        out.append(s)
    return out


# ── SERVICE SECTIONS (worker-facing) ──────────────────────────────────────────

@router.get("/me/services/{service_id}/sections")
async def get_service_sections(
    service_id: uuid.UUID,
    user: User = Depends(require_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    Which browse shelves this worker's service currently appears under, plus
    every shelf available to pick from.

    Ayush: *"better will be to give the workers themselves the ability to
    choose what this falls under. The thing that this falls under will be given
    by us."* So the SET of sections is admin-owned and read-only here; the
    worker only chooses membership.

    Sections attach to the CATALOG service, not the worker's own `Service` row.
    That's why this reads through `Service.catalog_service_id` — a worker's
    priced offering is an instance of a system service, and the shelf belongs
    to the system service. Consequence worth stating: two workers offering the
    same catalog service share its section membership. That's correct — the
    shelf is "Fan", not "Ramesh's fan work" — but it does mean one worker's
    change is visible to the other, so this is a curation act, not a personal
    setting.
    """
    from models import ServiceSection, ServiceSectionItem

    svc = (await db.execute(
        select(Service).where(Service.id == service_id)
    )).scalar_one_or_none()
    if not svc:
        raise HTTPException(404, "Service not found")

    wp = (await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )).scalar_one_or_none()
    if not wp or svc.worker_id != wp.id:
        raise HTTPException(403, "Not your service")

    if not svc.catalog_service_id:
        # A fully custom service has no system service to hang a shelf on.
        return {
            "eligible": False,
            "reason": "This is a custom service. Browse sections only apply to system services.",
            "selected_ids": [],
            "sections": [],
        }

    all_sections = (await db.execute(
        select(ServiceSection)
        .where(ServiceSection.is_active == True)  # noqa: E712
        .order_by(ServiceSection.sort_order, ServiceSection.name)
    )).scalars().all()

    selected = [str(r) for r in (await db.execute(
        select(ServiceSectionItem.section_id)
        .where(ServiceSectionItem.catalog_service_id == svc.catalog_service_id)
    )).scalars().all()]

    return {
        "eligible": True,
        "selected_ids": selected,
        "sections": [
            {"id": str(s.id), "name": s.name, "icon_emoji": s.icon_emoji, "description": s.description}
            for s in all_sections
        ],
    }


@router.put("/me/services/{service_id}/sections", response_model=SuccessResponse)
async def set_service_sections(
    service_id: uuid.UUID,
    body: dict,
    user: User = Depends(require_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    Set which shelves this service appears under.

    Only ACTIVE, admin-defined sections are accepted — a worker cannot invent a
    shelf, and cannot resurrect one an admin has deactivated. Unknown ids are
    dropped silently rather than 422'ing the whole request: a stale client
    holding a section that was just deleted shouldn't fail to save the rest.
    """
    from sqlalchemy import delete as sa_delete
    from models import ServiceSection, ServiceSectionItem

    svc = (await db.execute(
        select(Service).where(Service.id == service_id)
    )).scalar_one_or_none()
    if not svc:
        raise HTTPException(404, "Service not found")

    wp = (await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )).scalar_one_or_none()
    if not wp or svc.worker_id != wp.id:
        raise HTTPException(403, "Not your service")

    if not svc.catalog_service_id:
        raise HTTPException(
            409, "Browse sections only apply to system services, not custom ones."
        )

    requested = {str(x) for x in ((body or {}).get("section_ids") or [])}
    valid = [s for s in (await db.execute(
        select(ServiceSection.id)
        .where(ServiceSection.is_active == True)  # noqa: E712
    )).scalars().all() if str(s) in requested]

    await db.execute(
        sa_delete(ServiceSectionItem)
        .where(ServiceSectionItem.catalog_service_id == svc.catalog_service_id)
    )
    for i, sid in enumerate(valid):
        db.add(ServiceSectionItem(
            section_id=sid,
            catalog_service_id=svc.catalog_service_id,
            sort_order=i,
        ))

    await db.commit()
    return SuccessResponse(message=f"Listed under {len(valid)} section(s)")


# ══════════════════════════════════════════════════════════════════════════════
# WORKER CALENDAR — one shared timeline per worker (services/worker_calendar.py)
# /me routes are registered BEFORE /{worker_id} ones so "me" never hits the
# UUID path parameter.
# ══════════════════════════════════════════════════════════════════════════════

_CAL_MAX_DAYS = 62


def _parse_range(date_from: str | None, date_to: str | None, default_days: int = 35):
    from datetime import date as _date, timedelta as _td
    from services.worker_calendar import today_ist
    today = today_ist()
    try:
        d_from = _date.fromisoformat(date_from) if date_from else today
    except ValueError:
        raise HTTPException(422, "date_from must be YYYY-MM-DD")
    try:
        d_to = _date.fromisoformat(date_to) if date_to else d_from + _td(days=default_days - 1)
    except ValueError:
        raise HTTPException(422, "date_to must be YYYY-MM-DD")
    if d_to < d_from:
        raise HTTPException(422, "date_to must be on or after date_from")
    if (d_to - d_from).days >= _CAL_MAX_DAYS:
        raise HTTPException(422, f"Ask for at most {_CAL_MAX_DAYS} days at a time")
    return d_from, d_to


@router.get("/me/calendar")
async def my_calendar(
    date_from: str | None = None,
    date_to: str | None = None,
    user: User = Depends(require_worker),
    db: AsyncSession = Depends(get_db),
):
    """The worker's own timeline: hours, every busy item (with job titles), per-day load."""
    from datetime import timedelta as _td
    from services.worker_calendar import build_timeline, day_grid, day_state, service_slot_params

    wp = (await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))).scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")
    d_from, d_to = _parse_range(date_from, date_to, default_days=7)
    tl = await build_timeline(db, wp.id, d_from, d_to)
    slot_len, cap = await service_slot_params(db, None)

    days = []
    d = d_from
    while d <= d_to:
        days.append(day_state(tl, d, day_grid(tl, d, slot_len, cap, lead_min=0)))
        d += _td(days=1)

    return {
        "hours": {str(k): ([v[0].strftime("%H:%M"), v[1].strftime("%H:%M")] if v else None) for k, v in tl.hours.items()},
        "days": days,
        "items": [
            {
                "start": b.start.isoformat(timespec="minutes"),
                "end": b.end.isoformat(timespec="minutes"),
                "kind": b.kind,
                "job_id": str(b.job_id) if b.job_id else None,
                "block_id": str(b.block_id) if b.block_id else None,
                "label": b.label,
            }
            for b in tl.busy
            if b.end.date() >= d_from and b.start.date() <= d_to
        ],
        "status": wp.status,
    }


@router.post("/me/blocks", status_code=201)
async def create_block(
    body: dict,
    user: User = Depends(require_worker),
    db: AsyncSession = Depends(get_db),
):
    """
    Block a time range on one day ("not taking bookings 2–4 PM"). Refuses if
    it would cover an existing booking — cancelling a customer is a separate,
    deliberate action, never a side effect of tidying the calendar.
    """
    from datetime import date as _date, datetime as _dt, time as _time
    from services.worker_calendar import build_timeline, find_conflict, today_ist

    wp = (await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))).scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")
    try:
        d = _date.fromisoformat(str(body.get("date")))
        start = _time.fromisoformat(str(body.get("start")))
        end = _time.fromisoformat(str(body.get("end")))
    except ValueError:
        raise HTTPException(422, "date must be YYYY-MM-DD and start/end HH:MM")
    if end <= start:
        raise HTTPException(422, "End time must be after start time")
    if d < today_ist():
        raise HTTPException(422, "You can't block a day in the past")
    if (d - today_ist()).days > 180:
        raise HTTPException(422, "Blocks can be at most 6 months ahead")

    tl = await build_timeline(db, wp.id, d, d)
    s_dt, e_dt = _dt.combine(d, start), _dt.combine(d, end)
    clash = find_conflict(tl, s_dt, e_dt)
    if clash and clash.kind in ("job", "instant"):
        raise HTTPException(409, f"You have a booking at {clash.start.strftime('%I:%M %p').lstrip('0')} in that time. Reschedule or cancel it first.")
    blk = WorkerScheduleBlock(worker_id=wp.id, job_id=None, date=d, window_start=start, window_end=end)
    db.add(blk)
    await db.commit()
    return {"id": str(blk.id), "date": d.isoformat(), "start": start.strftime("%H:%M"), "end": end.strftime("%H:%M")}


@router.delete("/me/blocks/{block_id}", response_model=SuccessResponse)
async def delete_block(
    block_id: uuid.UUID,
    user: User = Depends(require_worker),
    db: AsyncSession = Depends(get_db),
):
    wp = (await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))).scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")
    blk = (await db.execute(
        select(WorkerScheduleBlock).where(
            WorkerScheduleBlock.id == block_id,
            WorkerScheduleBlock.worker_id == wp.id,
            WorkerScheduleBlock.job_id.is_(None),   # job reservations aren't the worker's to delete here
        )
    )).scalar_one_or_none()
    if not blk:
        raise HTTPException(404, "Block not found")
    await db.delete(blk)
    await db.commit()
    return SuccessResponse(message="Block removed")


async def _public_worker_and_service(db: AsyncSession, worker_id: uuid.UUID, service_id: uuid.UUID | None):
    wp = (await db.execute(
        select(WorkerProfile).where(WorkerProfile.id == worker_id, WorkerProfile.verification_status == "approved")
    )).scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker not found")
    svc = None
    if service_id:
        svc = (await db.execute(
            select(Service).where(Service.id == service_id, Service.worker_id == wp.id)
        )).scalar_one_or_none()
        if not svc:
            raise HTTPException(404, "Service not found for this worker")
    return wp, svc


@router.get("/{worker_id}/calendar")
async def public_calendar(
    worker_id: uuid.UUID,
    service_id: uuid.UUID | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Customer-facing month view: one state per day
    (available / few / full / day_off / leave / past) + live status + next free slot.
    Never exposes who booked or why a worker is away.
    """
    from datetime import timedelta as _td
    from services.worker_calendar import build_timeline, day_grid, day_state, live_status, next_free, service_slot_params, today_ist

    wp, svc = await _public_worker_and_service(db, worker_id, service_id)
    d_from, d_to = _parse_range(date_from, date_to)
    tl = await build_timeline(db, wp.id, min(d_from, today_ist()), max(d_to, today_ist() + _td(days=7)))
    slot_len, cap = await service_slot_params(db, svc)
    from services.worker_calendar import slot_grid, slot_rows
    rows = await slot_rows(db, svc, d_from, d_to) if (svc and svc.requires_slot) else None
    days = []
    d = d_from
    while d <= d_to:
        grid = slot_grid(tl, d, rows.get(d, [])) if rows is not None else day_grid(tl, d, slot_len, cap)
        days.append(day_state(tl, d, grid))
        d += _td(days=1)
    return {
        "slot_minutes": slot_len,
        "mode": "slot" if rows is not None else "window",
        "max_per_day": cap,
        "days": days,
        "live": await live_status(db, wp, tl),
        "next_free": await next_free(db, tl, svc),
    }


@router.get("/{worker_id}/calendar/day")
async def public_calendar_day(
    worker_id: uuid.UUID,
    date: str,
    service_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    """One day's start times for this service, each free / booked / unavailable / full / past."""
    from datetime import date as _date
    from services.worker_calendar import build_timeline, day_grid, day_state, service_slot_params

    wp, svc = await _public_worker_and_service(db, worker_id, service_id)
    try:
        d = _date.fromisoformat(date)
    except ValueError:
        raise HTTPException(422, "date must be YYYY-MM-DD")
    tl = await build_timeline(db, wp.id, d, d)
    slot_len, cap = await service_slot_params(db, svc)
    if svc and svc.requires_slot:
        from services.worker_calendar import slot_grid, slot_rows
        grid = slot_grid(tl, d, (await slot_rows(db, svc, d, d)).get(d, []))
        mode = "slot"
    else:
        grid = day_grid(tl, d, slot_len, cap)
        mode = "window"
    return {**day_state(tl, d, grid), "slot_minutes": slot_len, "mode": mode, "slots": grid}
