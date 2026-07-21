"""
Search router — personalized recommendations + click tracking.
Endpoints:
  GET  /search                  — full-text service search (logs history)
  POST /search/click            — record result_clicked_id after a search
  GET  /search/recommendations  — personalized (top_categories Phase-1 + global fill Phase-2)
  GET  /search/workers          — discovery browse
"""

from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, or_, case
from geoalchemy2.functions import ST_Distance, ST_MakePoint, ST_SetSRID

from database import get_db
from models import (
    Service, WorkerProfile, User, SearchHistory, UserPreference,
    Category, Tag, ServiceTag, WorkerLocation,
)
from schemas import SearchResult, SearchResponseWrapper
from dependencies import get_current_user
from services.config import get_config
from decimal import Decimal

router = APIRouter()


async def _update_user_preferences(db: AsyncSession, user_id: UUID) -> None:
    try:
        since = datetime.now(timezone.utc) - timedelta(days=60)
        rows = await db.execute(
            select(SearchHistory.category_id, func.count(SearchHistory.id).label("cnt"))
            .where(SearchHistory.user_id == user_id)
            .where(SearchHistory.category_id != None)
            .where(SearchHistory.created_at >= since)
            .group_by(SearchHistory.category_id)
            .order_by(func.count(SearchHistory.id).desc())
            .limit(5)
        )
        top_cats = [str(row.category_id) for row in rows.all()]

        existing = await db.execute(
            select(UserPreference).where(UserPreference.user_id == user_id)
        )
        pref = existing.scalar_one_or_none()
        now = datetime.now(timezone.utc)

        if pref:
            pref.top_categories = top_cats
            pref.updated_at = now
        else:
            db.add(UserPreference(
                user_id=user_id,
                top_categories=top_cats,
                updated_at=now,
            ))
        await db.commit()
    except Exception as exc:
        print(f"[SEARCH] _update_user_preferences failed for {user_id}: {exc}")


@router.get("", response_model=SearchResponseWrapper)
async def search(
    q: str = Query(..., min_length=1),
    mode: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    sort: Optional[str] = Query(
        None,
        pattern="^(rating|price_asc|price_desc|distance)$",
        description="Explicit sort override. Omit for the blended relevance default.",
    ),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=50),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Tokenized, multi-field, relevance-ranked search (Google/YouTube-style)
    instead of a single ILIKE on the service title.

    The old query did `Service.title.ilike(f"%{q}%")` — a single, literal
    substring match on the title only. Real data shows exactly why "security
    guard" failed: a service titled "24hrs Guard" (miscategorized under
    "Electrician", no matching description/tags) has neither "security" nor
    the phrase "security guard" anywhere in its title, so the old query
    filtered it out even though "guard" is a clear, relevant match.

    Now each word of the query is checked independently against title,
    description, category name, and tags — a row qualifies if it matches
    ANY word (OR across tokens, not AND — a strict AND would still have
    rejected "24hrs Guard" since it never mentions "security" anywhere).
    Rows are ranked by how many distinct words matched (closer full-phrase
    matches naturally rank higher), then by the requested sort.
    """
    offset = (page - 1) * limit
    tokens = [t for t in q.strip().split() if t] or [q.strip()]

    explicit_cat_id = None
    if category_id:
        try:
            explicit_cat_id = UUID(category_id)
        except ValueError:
            explicit_cat_id = None

    svc_q = (
        select(Service, WorkerProfile, User, Category)
        .join(WorkerProfile, WorkerProfile.id == Service.worker_id)
        .join(User, User.id == WorkerProfile.user_id)
        .join(Category, Category.id == Service.category_id)
        .where(Service.is_active == True)
        .where(WorkerProfile.verification_status == "approved")
    )

    # Tag matching uses a correlated EXISTS subquery rather than an outer join
    # to Tag — a join fans out one row per tag, and since `relevance` is
    # computed per joined row (not aggregated per service), DISTINCT can't
    # dedupe a service that has multiple tags: it comes back once per tag,
    # each copy with a different apparent relevance. EXISTS keeps one row
    # per service regardless of how many tags it has.
    def _tag_match(pattern: str):
        return select(1).select_from(ServiceTag).join(
            Tag, Tag.id == ServiceTag.tag_id
        ).where(
            ServiceTag.service_id == Service.id,
            Tag.name.ilike(pattern),
        ).exists()

    token_matches = []
    for tok in tokens:
        pattern = f"%{tok}%"
        token_matches.append(or_(
            Service.title.ilike(pattern),
            Service.description.ilike(pattern),
            Category.name.ilike(pattern),
            _tag_match(pattern),
        ))

    # Qualify on ANY token matching anywhere (OR), then rank by how many
    # distinct tokens matched — a query that matches more words ranks higher,
    # without requiring every word to appear (the bug above).
    svc_q = svc_q.where(or_(*token_matches))
    relevance_col = sum(case((expr, 1), else_=0) for expr in token_matches).label("relevance")

    if mode:
        # "both"-mode categories must match every mode filter, not just an
        # exact string equal to it — this was the actual reason Discovery
        # search returned nothing for real data: e.g. "Electrician" is
        # mode="both" (it's offered both instant and discovery), but
        # `Category.mode == "discovery"` is False for "both", so every
        # both-mode category (most of them) was being silently excluded
        # from every mode-scoped search.
        svc_q = svc_q.where(or_(Category.mode == mode, Category.mode == "both"))
    if explicit_cat_id:
        svc_q = svc_q.where(Service.category_id == explicit_cat_id)

    distance_col = None
    use_blended_default = sort is None

    # Distance is needed both for the explicit sort=distance case and for the
    # blended default (when customer coordinates are available) — join once.
    need_distance_join = (sort == "distance" or use_blended_default) and lat is not None and lon is not None
    if need_distance_join:
        distance_col = (
            ST_Distance(
                WorkerLocation.geom,
                ST_SetSRID(ST_MakePoint(lon, lat), 4326),
            ) / 1000.0
        ).label("distance_km")
        svc_q = svc_q.outerjoin(WorkerLocation, WorkerLocation.worker_id == WorkerProfile.id)
        svc_q = svc_q.add_columns(relevance_col, distance_col)
    else:
        svc_q = svc_q.add_columns(relevance_col)

    if sort == "distance" and distance_col is not None:
        svc_q = svc_q.order_by(distance_col.asc().nulls_last())
    elif sort == "price_asc":
        svc_q = svc_q.order_by(Service.price.asc())
    elif sort == "price_desc":
        svc_q = svc_q.order_by(Service.price.desc())
    elif not use_blended_default:
        # Explicit sort=rating (unchanged from prior behaviour: text relevance
        # first, then the service's own avg_rating), or sort=distance
        # requested without customer coordinates — fall back the same way.
        svc_q = svc_q.order_by(relevance_col.desc(), Service.avg_rating.desc())

    if use_blended_default:
        # ── Blended default ranking ────────────────────────────────────────────
        # Weighted combination, each term normalized to 0-1, computed downstream
        # of the tokenized text-match filter above (that filter is unchanged):
        #   rating   ~45%  — 70% service.avg_rating / 30% worker.avg_rating (both /5)
        #   distance ~35%  — only when customer lat/lon is supplied; cheaper^H
        #                    closer = better. Omitted (and weights renormalized)
        #                    when no customer location is passed.
        #   price    ~20%  — cheaper = better, min-max normalized over the
        #                    candidate pool.
        # Pull a bounded candidate pool (bigger than one page) so min/max
        # price/distance normalization reflects the real spread of matching
        # results, then rank + paginate in Python.
        W_RATING = float(await get_config(db, "search_weight_rating", Decimal("0.45")))
        W_DISTANCE = float(await get_config(db, "search_weight_distance", Decimal("0.35")))
        W_PRICE = float(await get_config(db, "search_weight_price", Decimal("0.20")))
        have_distance = distance_col is not None

        if not have_distance:
            # Renormalize remaining weights to sum to 1.0
            remaining = W_RATING + W_PRICE
            W_RATING = W_RATING / remaining
            W_PRICE = W_PRICE / remaining

        candidate_pool_size = max(limit * 10, 200)
        pool_q = svc_q.limit(candidate_pool_size)
        pool_rows = (await db.execute(pool_q)).all()

        prices = [float(r[0].price) for r in pool_rows if r[0].price is not None]
        min_price, max_price = (min(prices), max(prices)) if prices else (0.0, 0.0)
        price_span = (max_price - min_price) or 1.0

        if have_distance:
            dists = [float(r[5]) for r in pool_rows if len(r) > 5 and r[5] is not None]
            min_dist, max_dist = (min(dists), max(dists)) if dists else (0.0, 0.0)
            dist_span = (max_dist - min_dist) or 1.0

        def _blended_score(row, service_rating_weight, worker_rating_weight):
            svc, wp = row[0], row[1]
            svc_rating = float(svc.avg_rating or 0) / 5.0
            worker_rating = float(wp.avg_rating or 0) / 5.0
            rating_component = service_rating_weight * svc_rating + worker_rating_weight * worker_rating

            if svc.price is not None:
                price_component = 1.0 - ((float(svc.price) - min_price) / price_span)
            else:
                price_component = 0.5

            score = W_RATING * rating_component + W_PRICE * price_component

            if have_distance:
                dist_val = float(row[5]) if len(row) > 5 and row[5] is not None else None
                if dist_val is not None:
                    distance_component = 1.0 - ((dist_val - min_dist) / dist_span)
                else:
                    distance_component = 0.5
                score += W_DISTANCE * distance_component

            return score

        service_rating_weight = float(await get_config(db, "search_rating_service_weight", Decimal("0.70")))
        worker_rating_weight = float(await get_config(db, "search_rating_worker_weight", Decimal("0.30")))

        ranked = sorted(
            pool_rows,
            key=lambda r: (_blended_score(r, service_rating_weight, worker_rating_weight), r[4]),  # relevance_col is index 4
            reverse=True,
        )
        rows = ranked[offset:offset + limit]
    else:
        svc_q = svc_q.offset(offset).limit(limit)
        rows = (await db.execute(svc_q)).all()

    results = []
    for row in rows:
        svc, wp, u, cat = row[0], row[1], row[2], row[3]
        dist_km = float(row[5]) if distance_col is not None and len(row) > 5 and row[5] is not None else None
        results.append(SearchResult(
            result_type="service",
            id=svc.id,
            name=svc.title,
            price=svc.price,
            avg_rating=svc.avg_rating,
            worker_id=wp.id,
            worker_name=u.full_name,
            avatar_url=u.avatar_url,
            category_name=cat.name if cat else None,
            distance_km=dist_km,
        ))

    resolved_cat_id = None
    if category_id:
        try:
            resolved_cat_id = UUID(category_id)
        except ValueError:
            pass
    elif rows:
        first_svc = rows[0][0]
        resolved_cat_id = first_svc.category_id

    history = SearchHistory(
        user_id=user.id,
        query=q,
        detected_mode=mode,
        category_id=resolved_cat_id,
    )
    db.add(history)
    await db.commit()
    await db.refresh(history)

    if resolved_cat_id:
        # NOTE: this used to be `asyncio.create_task(_update_user_preferences(db, user.id))`
        # — a fire-and-forget task sharing this request's AsyncSession. FastAPI's
        # get_db dependency closes that session the moment this endpoint returns,
        # so the background task kept running queries on an already-closing
        # session, raising sqlalchemy.exc.IllegalStateChangeError ("close() can't
        # be called here; _connection_for_bind() is already in progress") and
        # turning every /search request into a 500. AsyncSession is not safe for
        # concurrent use across coroutines regardless of whether one of them is
        # "awaited" by the caller — awaiting it inline (a few small indexed
        # queries, negligible latency) is the correct fix, not a performance
        # compromise.
        await _update_user_preferences(db, user.id)

    return {"results": results, "search_history_id": str(history.id)}


@router.post("/click")
async def record_click(
    search_history_id: str = Body(...),
    result_clicked_id: str = Body(...),
    result_type: str = Body("service"),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        hist_uuid = UUID(search_history_id)
        clicked_uuid = UUID(result_clicked_id)
    except ValueError:
        return {"ok": False, "error": "invalid uuid"}

    await db.execute(
        update(SearchHistory)
        .where(SearchHistory.id == hist_uuid)
        .where(SearchHistory.user_id == user.id)
        .values(
            result_clicked_id=clicked_uuid,
            result_type=result_type,
        )
    )
    await db.commit()
    return {"ok": True}


@router.get("/recommendations", response_model=list[SearchResult])
async def recommendations(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    results = []
    seen_ids = set()

    def _to_result(svc, wp, u):
        return SearchResult(
            result_type="service",
            id=svc.id,
            name=svc.title,
            price=svc.price,
            avg_rating=svc.avg_rating,
            worker_id=wp.id,
            worker_name=u.full_name,
            avatar_url=u.avatar_url,
        )

    pref_row = await db.execute(
        select(UserPreference).where(UserPreference.user_id == user.id)
    )
    pref = pref_row.scalar_one_or_none()
    top_cats = pref.top_categories if pref and pref.top_categories else []

    if top_cats:
        try:
            cat_uuids = [UUID(c) for c in top_cats]
        except (ValueError, TypeError):
            cat_uuids = []

        if cat_uuids:
            personal_rows = (await db.execute(
                select(Service, WorkerProfile, User)
                .join(WorkerProfile, WorkerProfile.id == Service.worker_id)
                .join(User, User.id == WorkerProfile.user_id)
                .where(Service.is_active == True)
                .where(WorkerProfile.verification_status == "approved")
                .where(Service.category_id.in_(cat_uuids))
                .order_by(Service.avg_rating.desc(), Service.total_bookings.desc())
                .limit(12)
            )).fetchall()

            for svc, wp, u in personal_rows:
                if svc.id not in seen_ids:
                    results.append(_to_result(svc, wp, u))
                    seen_ids.add(svc.id)

    if len(results) < 20:
        global_rows = (await db.execute(
            select(Service, WorkerProfile, User)
            .join(WorkerProfile, WorkerProfile.id == Service.worker_id)
            .join(User, User.id == WorkerProfile.user_id)
            .where(Service.is_active == True)
            .where(WorkerProfile.verification_status == "approved")
            .order_by(Service.avg_rating.desc(), Service.total_bookings.desc())
            .limit(40)
        )).fetchall()

        for svc, wp, u in global_rows:
            if len(results) >= 20:
                break
            if svc.id not in seen_ids:
                results.append(_to_result(svc, wp, u))
                seen_ids.add(svc.id)

    return results


@router.get("/workers")
async def browse_workers(
    category: Optional[str] = Query(None),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    page: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * 20
    q = (
        select(WorkerProfile, User)
        .join(User, User.id == WorkerProfile.user_id)
        .where(WorkerProfile.verification_status == "approved")
        .where(WorkerProfile.is_discovery_available == True)
    )

    if category:
        from models import WorkerCategory, Category as CatModel
        q = (
            q.join(WorkerCategory, WorkerCategory.worker_id == WorkerProfile.id)
             .join(CatModel, CatModel.id == WorkerCategory.category_id)
             .where(CatModel.slug == category)
        )

    q = q.order_by(WorkerProfile.avg_rating.desc()).offset(offset).limit(20)
    rows = (await db.execute(q)).all()

    out = []
    for wp, u in rows:
        out.append({
            "id": str(wp.id),
            "full_name": u.full_name,
            "avatar_url": u.avatar_url,
            "avg_rating": float(wp.avg_rating),
            "rating_count": wp.rating_count,
            "total_jobs_completed": wp.total_jobs_completed,
            "min_rate": float(wp.min_rate) if getattr(wp, "min_rate", None) else 50.0,
        })
    return {"results": out}
