from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from database import get_db
from models import Service, WorkerProfile, User, SearchHistory
from schemas import SearchResult, SearchResponseWrapper
from dependencies import get_current_user

router = APIRouter()

# FIXED: Returns SearchResponseWrapper instead of list
@router.get("", response_model=SearchResponseWrapper)
async def search(
    q: str = Query(..., min_length=1),
    mode: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, le=50),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    offset = (page - 1) * limit
    pattern = f"%{q}%"

    svc_result = await db.execute(
        select(Service, WorkerProfile, User)
        .join(WorkerProfile, WorkerProfile.id == Service.worker_id)
        .join(User, User.id == WorkerProfile.user_id)
        .where(Service.is_active == True)
        .where(Service.title.ilike(pattern))
        .offset(offset).limit(limit)
    )
    rows = svc_result.fetchall()

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

    history = SearchHistory(user_id=user.id, query=q, detected_mode=mode)
    db.add(history)
    await db.commit()

    # Wrap in dict
    return {"results": results}

@router.get("/recommendations", response_model=list[SearchResult])
async def recommendations(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(Service, WorkerProfile, User)
        .join(WorkerProfile, WorkerProfile.id == Service.worker_id)
        .join(User, User.id == WorkerProfile.user_id)
        .where(Service.is_active == True)
        .where(WorkerProfile.verification_status == "approved")
        .order_by(Service.avg_rating.desc(), Service.total_bookings.desc())
        .limit(20)
    )
    rows = result.fetchall()
    return [
        SearchResult(
            result_type="service",
            id=svc.id,
            name=svc.title,
            price=svc.price,
            avg_rating=svc.avg_rating,
            worker_id=wp.id,
            worker_name=u.full_name,
            avatar_url=u.avatar_url,
        )
        for svc, wp, u in rows
    ]

# FIXED: Added missing endpoint for discovery browsing
@router.get("/workers")
async def browse_workers(
    category: Optional[str] = Query(None),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    page: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * 20
    q = (select(WorkerProfile, User)
         .join(User, User.id == WorkerProfile.user_id)
         .where(WorkerProfile.verification_status == 'approved')
         .where(WorkerProfile.is_discovery_available == True))
         
    if category:
        from models import WorkerCategory, Category as CatModel
        q = q.join(WorkerCategory, WorkerCategory.worker_id == WorkerProfile.id)\
             .join(CatModel, CatModel.id == WorkerCategory.category_id)\
             .where(CatModel.slug == category)
             
    q = q.order_by(WorkerProfile.avg_rating.desc()).offset(offset).limit(20)
    result = await db.execute(q)
    
    out = []
    for wp, u in result.all():
        out.append({
            "id": str(wp.id),
            "full_name": u.full_name,
            "avatar_url": u.avatar_url,
            "avg_rating": float(wp.avg_rating),
            "rating_count": wp.rating_count,
            "total_jobs_completed": wp.total_jobs_completed,
            "min_rate": float(wp.min_rate) if getattr(wp, 'min_rate', None) else 50.0,
        })
    return {"results": out}