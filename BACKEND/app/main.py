# app/main.py
import os
import json
import logging
import asyncpg
from typing import Optional, List, Any, Dict
from dotenv import load_dotenv

# load .env early so app.auth can read vars
load_dotenv()

from fastapi import FastAPI, Depends, Header, Request, HTTPException, Query, Path
from pydantic import BaseModel, conint
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from app.auth import verify_and_decode_jwt, get_user_id_from_jwt, is_admin_token

logger = logging.getLogger("uvicorn.error")

# --- CONFIG & DATABASE ---
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL required")

app = FastAPI(title="KAARGAR API (Auth MVP)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- LIFECYCLE EVENTS ---
@app.on_event("startup")
async def startup():
    logger.info("Starting: creating DB pool")
    app.state.db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=8)
    logger.info("DB pool ready")

@app.on_event("shutdown")
async def shutdown():
    await app.state.db_pool.close()

# --- DEPENDENCIES ---
async def require_user(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Invalid Authorization header")
    token = authorization.split(" ", 1)[1].strip()
    payload = verify_and_decode_jwt(token)
    logger.info("require_user: validated token sub=%s", payload.get("sub"))
    return payload

async def require_admin(authorization: str = Header(None)):
    if is_admin_token(authorization):
        return {"service_role": True}
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.split(" ", 1)[1].strip()
    payload = verify_and_decode_jwt(token)
    sub = payload.get("sub")
    async with app.state.db_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT role FROM public.users WHERE id = $1", sub)
    if row and row["role"] and "admin" in row["role"]:
        return {"service_role": False, "user_id": sub}
    raise HTTPException(status_code=403, detail="Admin role required")

async def _is_admin_or_owner(target_user_id: str, authorization: str = Header(None)) -> bool:
    if is_admin_token(authorization):
        return True
    if not authorization:
        return False
    token = authorization.split(" ", 1)[1].strip()
    payload = verify_and_decode_jwt(token)
    return payload.get("sub") == target_user_id

# --- PYDANTIC MODELS ---
class RatingCreate(BaseModel):
    rating: conint(ge=1, le=5)
    review_text: Optional[str] = None
    job_id: Optional[str] = None

class UserUpdatePayload(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    wants_worker: Optional[bool] = None
    professions: Optional[List[str]] = None
    skills: Optional[List[str]] = None
    hourly_rate_cents: Optional[int] = None
    accepts_remote: Optional[bool] = None
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

# ==========================================
#                ENDPOINTS
# ==========================================

@app.get("/_health")
async def health():
    return {"ok": True}

# --- AUTH & USER BASICS ---

@app.post("/api/auth/upsert_user")
async def upsert_user_endpoint(request: Request, payload = Depends(require_user)):
    uid = payload.get("sub")
    email = payload.get("email")
    user_meta = payload.get("user_metadata") or {}
    
    name = (
        user_meta.get("full_name") 
        or user_meta.get("name") 
        or payload.get("name") 
        or (email.split("@")[0] if email else None)
    )

    async with app.state.db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO public.users (id, email, name, created_at, role, metadata)
            VALUES ($1, $2, $3, now(), ARRAY['customer']::text[], $4::jsonb)
            ON CONFLICT (id) DO UPDATE
              SET email = EXCLUDED.email,
                  name = COALESCE(EXCLUDED.name, public.users.name),
                  metadata = public.users.metadata || EXCLUDED.metadata
        """, uid, email, name, json.dumps(payload))

        row = await conn.fetchrow("SELECT id, email, name, role FROM public.users WHERE id = $1", uid)
    
    return {"ok": True, "user": dict(row)}

@app.get("/api/me")
async def me(payload = Depends(require_user)):
    uid = payload.get("sub")
    async with app.state.db_pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT
              u.id, u.email, u.name, COALESCE(u.phone_masked, u.phone) AS phone_masked,
              u.role, u.is_flagged, u.rating_avg, u.rating_count, COALESCE(u.trouble_score, 0) AS trouble_score,
              u.tags, u.metadata,
              CASE WHEN u.location IS NOT NULL THEN ST_AsGeoJSON(u.location::geometry) ELSE NULL END AS location_geojson,
              wp.professions, wp.skills, wp.hourly_rate_cents, wp.min_hourly_rate_cents, wp.max_hourly_rate_cents,
              wp.accepts_remote, wp.bio, wp.search_radius_km, wp.kyc_status,
              COALESCE(w.balance_cents, 0) AS wallet_balance,
              COALESCE(w.reserved_cents, 0) AS wallet_reserved,
              (COALESCE(w.balance_cents, 0) - COALESCE(w.reserved_cents, 0)) AS wallet_available
            FROM public.users u
            LEFT JOIN public.worker_profiles wp ON wp.user_id = u.id
            LEFT JOIN public.wallets w ON w.user_id = u.id
            WHERE u.id = $1
        """, uid)

    if not row:
        raise HTTPException(status_code=404, detail="User row not found")

    user = dict(row)
    # Normalise fields to ensure frontend doesn't break on nulls
    user["professions"] = user.get("professions") or []
    user["skills"] = user.get("skills") or []
    user["tags"] = user.get("tags") or []
    user["wallet_balance"] = float(user.get("wallet_balance") or 0)
    user["wallet_reserved"] = float(user.get("wallet_reserved") or 0)
    user["wallet_available"] = float(user.get("wallet_available") or 0)

    return {"ok": True, "user": user}

@app.put("/api/users/{user_id}")
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

# --- SEARCH & PUBLIC PROFILES ---
@app.get("/api/search/workers")
async def search_workers(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_meters: Optional[int] = Query(10000),
    category: Optional[str] = Query(None),
    min_hourly_cents: Optional[int] = Query(None),
    max_hourly_cents: Optional[int] = Query(None),
    limit: int = Query(50, gt=0, le=200),
):
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT * FROM public.search_workers_for_user_ranked(
              NULL::uuid, $1::float8, $2::float8, $3::int, $4::text, $5::bigint, $6::bigint, $7::int
            )
        """, lat, lon, radius_meters, category, min_hourly_cents, max_hourly_cents, limit)
    return {"ok": True, "workers": [dict(r) for r in rows]}

@app.get("/api/search/jobs")
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
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT * FROM public.search_jobs_for_worker(
                $1::uuid, $2::float8, $3::float8, $4::int, $5::text, $6::bigint, $7::bigint, $8::int
            )
        """, worker_id, lat, lon, radius_meters, category, min_pay_cents, max_pay_cents, limit)
    return {"ok": True, "jobs": [dict(r) for r in rows]}

@app.get("/api/workers/{worker_id}")
async def get_worker_profile(worker_id: str = Path(...)):
    async with app.state.db_pool.acquire() as conn:
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
            
        wallet = await conn.fetchrow("SELECT balance_cents, reserved_cents FROM public.wallets WHERE user_id = $1::uuid", worker_id)
        ratings = await conn.fetch("""
            SELECT id, job_id, from_user_id, rating, review_text, created_at
            FROM public.ratings WHERE to_user_id = $1::uuid ORDER BY created_at DESC LIMIT 10
        """, worker_id)
    
    res = dict(row)
    res["wallet"] = dict(wallet) if wallet else {"balance_cents": 0, "reserved_cents": 0}
    res["recent_ratings"] = [dict(r) for r in ratings]
    return {"ok": True, "worker": res}

@app.get("/api/jobs/{job_id}")
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

# --- ACTIONS & KYC ---

@app.post("/api/users/{user_id}/ratings")
async def create_rating(user_id: str, payload: RatingCreate, actor = Depends(require_user)):
    from_user = actor.get("sub")
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO public.ratings (id, job_id, from_user_id, to_user_id, rating, review_text, created_at)
            VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::smallint, $5::text, now())
        """, payload.job_id, from_user, user_id, payload.rating, payload.review_text)
        
        await conn.execute("""
            UPDATE public.users
            SET rating_count = COALESCE(rating_count, 0) + 1,
                rating_avg = ROUND((COALESCE(rating_avg, 0)::numeric * COALESCE(rating_count, 0) + $1::numeric) / (COALESCE(rating_count, 0) + 1)::numeric, 2)
            WHERE id = $2::uuid
        """, payload.rating, user_id)
    return {"ok": True}

@app.post("/api/users/{user_id}/kyc")
async def create_kyc(user_id: str, payload: KycCreatePayload, actor = Depends(require_user)):
    caller = actor.get("sub")
    if caller != user_id:
        raise HTTPException(status_code=403, detail="only_owner")
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO public.kyc_documents (id, user_id, doc_type, storage_key, content_hash, status, uploaded_at)
            VALUES (gen_random_uuid(), $1::uuid, $2::text, $3::text, $4::text, 'uploaded', now())
        """, user_id, payload.doc_type, payload.storage_key, payload.content_hash)
    return {"ok": True}

@app.get("/api/users/{user_id}/kyc_docs")
async def get_user_kyc_docs(user_id: str = Path(...), authorization: str = Header(None)):
    if not await _is_admin_or_owner(user_id, authorization):
        raise HTTPException(status_code=403, detail="Forbidden")
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, doc_type, status, storage_key, uploaded_at, reviewed_by, reviewed_at, reviewed_notes
            FROM public.kyc_documents WHERE user_id = $1 ORDER BY uploaded_at DESC
        """, user_id)
    return {"ok": True, "kyc_documents": [dict(r) for r in rows]}

# --- ADMIN ---

@app.post("/api/admin/toggle_flag")
async def toggle_flag(payload: ToggleFlagPayload, admin = Depends(require_admin)):
    admin_id = admin.get("user_id") if isinstance(admin, dict) else None
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("UPDATE public.users SET is_flagged = $1 WHERE id = $2::uuid", payload.flag, payload.user_id)
        await conn.execute("""
            INSERT INTO public.events (entity_type, entity_id, event_type, payload, created_at)
            VALUES ('user', $1::uuid, 'flag_toggled', $2::jsonb, now())
        """, payload.user_id, json.dumps({"flag": payload.flag, "reason": payload.reason, "admin": admin_id}))
    return {"ok": True}

@app.get("/api/admin/flagged_users")
async def list_flagged(limit: int = Query(100, gt=0, le=1000), offset: int = Query(0, ge=0), admin = Depends(require_admin)):
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, name, phone_masked, is_flagged, trouble_score, complaints_count, cancellation_count, metadata
            FROM public.users WHERE is_flagged = true
            ORDER BY trouble_score DESC NULLS LAST
            LIMIT $1 OFFSET $2
        """, limit, offset)
    return {"ok": True, "users": [dict(r) for r in rows]}

# ---------------------------
# Custom OpenAPI (adds Authorize button for Bearer token)
# ---------------------------
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title=app.title,
        version="1.0.0",
        description="KAARGAR API (Auth MVP)",
        routes=app.routes,
    )
    # add bearer scheme
    openapi_schema.setdefault("components", {}).setdefault("securitySchemes", {})
    openapi_schema["components"]["securitySchemes"]["BearerAuth"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
    }
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi
