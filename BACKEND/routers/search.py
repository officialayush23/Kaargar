from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, text
from typing import Optional

from database import get_db
from models import Service, WorkerProfile, Category, User, SearchHistory
from schemas import SearchResult
from dependencies import get_current_user

router = APIRouter()


@router.get("", response_model=list[SearchResult])
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

    # Search services
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

    # Log search
    history = SearchHistory(user_id=user.id, query=q, detected_mode=mode)
    db.add(history)
    await db.commit()

    return results


@router.get("/recommendations", response_model=list[SearchResult])
async def recommendations(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    # Return top-rated active services
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
