from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Request, Header, Path, Query
from pydantic import BaseModel, conint
import json

# import the app object and dependency functions from main
from app.main import app, require_user, require_admin

router = APIRouter(prefix="/api")

# ---------- Pydantic models ----------
class RatingCreate(BaseModel):
    rating: conint(ge=1, le=5)
    review_text: Optional[str] = None
    job_id: Optional[str] = None

class UserUpdatePayload(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    # worker-specific fields
    wants_worker: Optional[bool] = None
    worker_type: Optional[str] = None
    professions: Optional[List[str]] = None
    skills: Optional[List[str]] = None
    hourly_rate_cents: Optional[int] = None
    accepts_remote: Optional[bool] = None
    address: Optional[str] = None
    location_geojson: Optional[Dict[str,Any]] = None
    metadata: Optional[Dict[str,Any]] = None

class KycCreatePayload(BaseModel):
    doc_type: str
    storage_key: str
    content_hash: Optional[str] = None
    metadata: Optional[Dict[str,Any]] = None

class ToggleFlagPayload(BaseModel):
    user_id: str
    flag: bool
    reason: Optional[str] = None

# ---------- Ratings ----------
@router.post("/users/{user_id}/ratings")
async def create_rating(user_id: str, payload: RatingCreate, actor = Depends(require_user)):
    from_user = actor.get("sub")
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO public.ratings (id, job_id, from_user_id, to_user_id, rating, review_text, created_at)
            VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::smallint, $5::text, now())
        """, payload.job_id, from_user, user_id, payload.rating, payload.review_text)
        # lightweight aggregate update (may be replaced by a trigger or materialized approach later)
        await conn.execute("""
            UPDATE public.users
            SET rating_count = COALESCE(rating_count, 0) + 1,
                rating_avg = ROUND((
                  COALESCE(rating_avg, 0)::numeric * COALESCE(rating_count, 0) + $1::numeric
                ) / (COALESCE(rating_count, 0) + 1)::numeric, 2)
            WHERE id = $2::uuid
        """, payload.rating, user_id)
    return {"ok": True}

# ---------- Admin flag endpoints ----------
@router.post("/admin/toggle_flag")
async def toggle_flag(payload: ToggleFlagPayload, admin = Depends(require_admin)):
    admin_id = admin.get("user_id") if isinstance(admin, dict) else None
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("UPDATE public.users SET is_flagged = $1 WHERE id = $2::uuid", payload.flag, payload.user_id)
        await conn.execute("""
            INSERT INTO public.events (entity_type, entity_id, event_type, payload, created_at)
            VALUES ('user', $1::uuid, 'flag_toggled', $2::jsonb, now())
        """, payload.user_id, json.dumps({"flag": payload.flag, "reason": payload.reason, "admin": admin_id}))
    return {"ok": True}

@router.get("/admin/flagged_users")
async def list_flagged(limit: int = Query(100, gt=0, le=1000), offset: int = Query(0, ge=0), admin = Depends(require_admin)):
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, name, phone_masked, is_flagged, trouble_score, complaints_count, cancellation_count, metadata
            FROM public.users WHERE is_flagged = true
            ORDER BY trouble_score DESC NULLS LAST
            LIMIT $1 OFFSET $2
        """, limit, offset)
    return {"ok": True, "users": [dict(r) for r in rows]}

# ---------- Search endpoints (call your DB-side functions) ----------
@router.get("/search/workers")
async def search_workers(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_meters: Optional[int] = Query(10000),
    category: Optional[str] = Query(None),
    min_hourly_cents: Optional[int] = Query(None),
    max_hourly_cents: Optional[int] = Query(None),
    limit: int = Query(50, gt=0, le=200),
):
    """
    Calls public.search_workers_for_user_ranked(...) — returns ranked list of workers.
    """
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT * FROM public.search_workers_for_user_ranked(
              NULL::uuid,
              $1::double precision, $2::double precision, $3::integer, $4::text, $5::bigint, $6::bigint, $7::integer
            )
        """, lat, lon, radius_meters, category, min_hourly_cents, max_hourly_cents, limit)
    return {"ok": True, "workers": [dict(r) for r in rows]}

@router.get("/search/jobs")
async def search_jobs_for_worker(
    worker_id: Optional[str] = Query(None),
    lat: float = Query(...),
    lon: float = Query(...),
    radius_meters: Optional[int] = Query(20000),
    category: Optional[str] = Query(None),
    min_pay_cents: Optional[int] = Query(None),
    max_pay_cents: Optional[int] = Query(None),
    limit: int = Query(50, gt=0, le=200)
):
    """
    Calls public.search_jobs_for_worker(...)
    """
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT * FROM public.search_jobs_for_worker($1::uuid, $2::double precision, $3::double precision, $4::integer, $5::text, $6::bigint, $7::bigint, $8::integer)
        """, worker_id, lat, lon, radius_meters, category, min_pay_cents, max_pay_cents, limit)
    return {"ok": True, "jobs": [dict(r) for r in rows]}

# ---------- Worker public profile ----------
@router.get("/workers/{worker_id}")
async def get_worker_profile(worker_id: str = Path(...)):
    async with app.state.db_pool.acquire() as conn:
        # FIXED: Updated column names to match schema (_cents)
        row = await conn.fetchrow("""
            SELECT u.id, u.name, u.phone_masked, COALESCE(u.rating_avg,0) AS rating_avg, COALESCE(u.rating_count,0) AS rating_count,
                   u.is_flagged, u.trouble_score, u.metadata,
                   wp.professions, wp.skills, wp.hourly_rate_cents, wp.min_hourly_rate_cents, wp.max_hourly_rate_cents,
                   wp.accepts_remote, wp.bio, wp.search_radius_km, wp.kyc_status, wp.documents
            FROM public.users u
            LEFT JOIN public.worker_profiles wp ON wp.user_id = u.id
            WHERE u.id = $1::uuid
        """, worker_id)
        if not row:
            raise HTTPException(status_code=404, detail="worker_not_found")
            
        # FIXED: Updated wallet column names to match schema (balance_cents, reserved_cents)
        wallet = await conn.fetchrow("SELECT balance_cents, reserved_cents FROM public.wallets WHERE user_id = $1::uuid", worker_id)
        
        ratings = await conn.fetch("""
            SELECT id, job_id, from_user_id, rating, review_text, created_at
            FROM public.ratings WHERE to_user_id = $1::uuid ORDER BY created_at DESC LIMIT 10
        """, worker_id)
    
    res = dict(row)
    # Map cents back to readable names if preferred, or keep as is. Keeping as is for safety.
    res["wallet"] = dict(wallet) if wallet else {"balance_cents": 0, "reserved_cents": 0}
    res["recent_ratings"] = [dict(r) for r in ratings]
    return {"ok": True, "worker": res}

# ---------- Job detail ----------
@router.get("/jobs/{job_id}")
async def get_job_detail(job_id: str = Path(...)):
    async with app.state.db_pool.acquire() as conn:
        job = await conn.fetchrow("""
            SELECT j.*, u.name AS customer_name, u.rating_avg AS customer_rating
            FROM public.jobs j
            LEFT JOIN public.users u ON u.id = j.customer_id
            WHERE j.id = $1::uuid
        """, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="job_not_found")
        bids = await conn.fetch("SELECT id, worker_id, amount_cents, message, status, created_at FROM public.bids WHERE job_id = $1::uuid ORDER BY amount_cents DESC", job_id)
        attachments = await conn.fetch("SELECT id, storage_key, filename, mime_type FROM public.media_attachments WHERE job_id = $1::uuid", job_id)
    jd = dict(job)
    jd["bids"] = [dict(b) for b in bids]
    jd["attachments"] = [dict(a) for a in attachments]
    return {"ok": True, "job": jd}

# ---------- User update ----------
@router.put("/users/{user_id}")
async def update_user(user_id: str, payload: UserUpdatePayload, actor = Depends(require_user)):
    caller = actor.get("sub")
    if caller != user_id:
        raise HTTPException(status_code=403, detail="only_owner")
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("""
            UPDATE public.users SET
              name = COALESCE($1, name),
              phone = COALESCE($2, phone),
              metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE($3::jsonb, '{}'::jsonb)
            WHERE id = $4::uuid
        """, payload.name, payload.phone, json.dumps(payload.metadata or {}), user_id)

        if any([payload.professions, payload.skills, payload.hourly_rate_cents is not None, payload.accepts_remote is not None]):
            # FIXED: Updated column name to hourly_rate_cents
            await conn.execute("""
                INSERT INTO public.worker_profiles (user_id, professions, skills, hourly_rate_cents, accepts_remote, bio, search_radius_km, created_at)
                VALUES ($1::uuid, $2::text[], $3::text[], $4::bigint, $5::boolean, NULL, NULL, now())
                ON CONFLICT (user_id) DO UPDATE
                SET professions = COALESCE($2::text[], public.worker_profiles.professions),
                    skills = COALESCE($3::text[], public.worker_profiles.skills),
                    hourly_rate_cents = COALESCE($4, public.worker_profiles.hourly_rate_cents),
                    accepts_remote = COALESCE($5, public.worker_profiles.accepts_remote)
            """, user_id, payload.professions, payload.skills, payload.hourly_rate_cents, payload.accepts_remote)
    return {"ok": True}

# ---------- KYC doc create (MVP) ----------
@router.post("/users/{user_id}/kyc")
async def create_kyc(user_id: str, payload: KycCreatePayload, actor = Depends(require_user)):
    caller = actor.get("sub")
    if caller != user_id:
        raise HTTPException(status_code=403, detail="only_owner")
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO public.kyc_documents (id, user_id, doc_type, storage_key, content_hash, status, uploaded_at, reviewed_notes)
            VALUES (gen_random_uuid(), $1::uuid, $2::text, $3::text, $4::text, 'uploaded', now(), NULL)
        """, user_id, payload.doc_type, payload.storage_key, payload.content_hash)
    return {"ok": True}

# register router with the main app
app.include_router(router)