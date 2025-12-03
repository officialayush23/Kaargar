

from fastapi import APIRouter, Depends, Query
from typing import Optional
import asyncpg
from app.dependencies import get_db, require_db_user

router = APIRouter(tags=["Search"])

@router.get("/api/search")
async def search_workers(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_meters: int = Query(20000),
    profession: Optional[str] = Query(None),
    service: Optional[str] = Query(None),
    min_rate: Optional[int] = Query(None),
    max_rate: Optional[int] = Query(None),
    gender: Optional[str] = Query(None),
    order_by: str = Query("recommended"),
    conn: asyncpg.Connection = Depends(get_db),
    user: dict = Depends(require_db_user),
):
    rows = await conn.fetch(
        "SELECT * FROM public.search_workers_v4($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        lat, lon, radius_meters, profession, service, min_rate, max_rate, gender, order_by
    )
    return {"ok": True, "data": [dict(r) for r in rows]}

@router.get("/api/jobs/search")
async def search_jobs(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_meters: int = Query(20000),
    query: Optional[str] = Query(None),
    min_budget: Optional[int] = Query(None),
    profession: Optional[str] = Query(None),
    services: Optional[str] = Query(None),
    only_open: bool = Query(True),
    conn: asyncpg.Connection = Depends(get_db),
    user: dict = Depends(require_db_user),
):
    services_arr = [s.strip() for s in services.split(",")] if services else None
    rows = await conn.fetch(
        "SELECT * FROM public.search_jobs_v4($1, $2, $3, $4, $5, $6, $7, $8)",
        lat, lon, radius_meters, query, min_budget, profession, services_arr, only_open
    )
    return {"ok": True, "data": [dict(r) for r in rows]}

