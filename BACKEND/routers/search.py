"""
Search router — personalized recommendations + click tracking.
Endpoints:
  GET  /search                  — full-text service search (logs history)
  POST /search/click            — record result_clicked_id after a search
  GET  /search/recommendations  — personalized (top_categories Phase-1 + global fill Phase-2)
  GET  /search/workers          — discovery browse
"""

import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update

from database import get_db
from models import Service, WorkerProfile, User, SearchHistory, UserPreference
from schemas import SearchResult, SearchResponseWrapper
from dependencies import get_current_user

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
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=50),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    offset = (page - 1) * limit
    pattern = f"%{q}%"

    svc_q = (
        select(Service, WorkerProfile, User)
        .join(WorkerProfile, WorkerProfile.id == Service.worker_id)
        .join(User, User.id == WorkerProfile.user_id)
        .where(Service.is_active == True)
        .where(WorkerProfile.verification_status == "approved")
        .where(Service.title.ilike(pattern))
    )
    if mode:
        from models import Category as CatModel
        svc_q = svc_q.join(CatModel, CatModel.id == Service.category_id).where(CatModel.mode == mode)

    svc_q = svc_q.order_by(Service.avg_rating.desc()).offset(offset).limit(limit)
    rows = (await db.execute(svc_q)).fetchall()

    results = []
    for svc, wp, u in rows:
        results.append(SearchResult(
            result_type="service",
            id=svc.id,
            name=svc.title,
            price=svc.price,
            avg_rating=svc.avg_rating,
            worker_id=wp.id,
            worker_name=u.full_name,
            avatar_url=u.avatar_url,
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
        asyncio.create_task(_update_user_preferences(db, user.id))

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
