import os
import json
import uuid
import logging
import asyncio
from typing import Optional, List, Any, Dict
from datetime import date, datetime

import asyncpg
import redis.asyncio as redis
from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    status,
    WebSocket,
    WebSocketDisconnect,
    Request,
    Body,
    Path,
    Query,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jose import jwt, JWTError
from pydantic import BaseModel, Field

# -------------------------------------------------------------------
# Config
# -------------------------------------------------------------------

logger = logging.getLogger("kaargar")
logging.basicConfig(level=logging.INFO)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
if not SUPABASE_JWT_SECRET:
    raise RuntimeError("SUPABASE_JWT_SECRET is not set")

SUPABASE_JWT_AUD = os.getenv("SUPABASE_JWT_AUD", "authenticated")

REDIS_URL = os.getenv("REDIS_URL")  # redis://:password@host:port/0

# Buckets (Supabase Storage) – actual upload is done from frontend
CHAT_MEDIA_BUCKET = "chat_media"
JOB_PROOF_BUCKET = "JOB_PROOF"
KYC_DOCS_BUCKET = "KYC_DOCS"

# CORS
raw_origins = os.getenv("CORS_ORIGINS", "")
if raw_origins.strip():
    ALLOWED_ORIGINS = [o.strip() for o in raw_origins.split(",") if o.strip()]
else:
    # dev-friendly default; lock this down in prod
    ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://kaargar.vercel.app",
    ]

app = FastAPI(title="KAARGAR API v4")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# -------------------------------------------------------------------
# Startup / Shutdown
# -------------------------------------------------------------------


@app.on_event("startup")
async def startup_event():
    logger.info("Starting up: creating DB pool and Redis client")

    app.state.db_pool = await asyncpg.create_pool(
        DATABASE_URL,
        min_size=2,
        max_size=20,
        command_timeout=30,
        server_settings={"application_name": "kaargar_api"},
    )

    if REDIS_URL:
        app.state.redis = redis.from_url(REDIS_URL, decode_responses=True)
        logger.info("Connected Redis at %s", REDIS_URL)
    else:
        app.state.redis = None
        logger.warning("REDIS_URL not set; Redis features disabled")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down: closing DB pool and Redis")
    if getattr(app.state, "db_pool", None):
        await app.state.db_pool.close()
    if getattr(app.state, "redis", None):
        await app.state.redis.close()


# -------------------------------------------------------------------
# Dependencies: DB, Auth
# -------------------------------------------------------------------


async def get_db():
    pool = app.state.db_pool
    async with pool.acquire() as conn:
        yield conn


def _get_bearer_token(request: Request) -> str:
    auth_header = request.headers.get("authorization") or request.headers.get(
        "Authorization"
    )
    if not auth_header:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing Authorization header")

    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Invalid Authorization header format"
        )

    return parts[1]


async def require_user(request: Request) -> dict:
    token = _get_bearer_token(request)
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience=SUPABASE_JWT_AUD,
        )
    except JWTError as e:
        logger.warning("JWT decode failed: %s", e)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing subject")

    return payload  # contains sub, email, role, etc.


async def require_db_user(
    token: dict = Depends(require_user),
    conn: asyncpg.Connection = Depends(get_db),
) -> dict:
    uid = uuid.UUID(token["sub"])
    row = await conn.fetchrow(
        """
        SELECT id, email, full_name, role
        FROM public.users
        WHERE id = $1
        """,
        uid,
    )
    if not row:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User not onboarded")

    return {
        "id": row["id"],
        "email": row["email"],
        "full_name": row["full_name"],
        "role": row["role"],
        "jwt": token,
    }


async def require_worker(
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
) -> dict:
    if user["role"] != "worker":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Worker account required")

    wp = await conn.fetchrow(
        "SELECT * FROM public.worker_profiles WHERE user_id = $1",
        user["id"],
    )
    if not wp:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Worker profile not set up")

    # Enforce KYC at backend (DB trigger also enforces on bids)
    if wp["kyc_status"] != "verified":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "KYC not verified. Complete KYC to access worker features.",
        )

    return {**user, "worker_profile": wp}


async def require_admin(
    user: dict = Depends(require_db_user),
) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return user


# -------------------------------------------------------------------
# Pydantic Models
# -------------------------------------------------------------------


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    address_text: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    gender: Optional[str] = Field(None, regex="^(male|female|other)$")


class WorkerProfileUpdate(BaseModel):
    worker_type: Optional[str] = None  # public.worker_type
    tier: Optional[str] = None  # public.worker_tier
    professions: Optional[List[str]] = None
    services: Optional[List[str]] = None
    skills: Optional[List[str]] = None
    min_hourly_rate_cents: Optional[int] = None
    max_hourly_rate_cents: Optional[int] = None
    experience_years: Optional[int] = None
    about_text: Optional[str] = None
    search_radius_meters: Optional[int] = None
    accepts_remote: Optional[bool] = None
    accepts_auto_assign: Optional[bool] = None
    is_online: Optional[bool] = None


class LocationUpdate(BaseModel):
    lat: float
    lon: float


class JobCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    profession_required: Optional[str] = None
    services_required: Optional[List[str]] = None
    is_remote: bool = False
    lat: Optional[float] = None
    lon: Optional[float] = None
    budget_min_cents: Optional[int] = None
    budget_max_cents: Optional[int] = None
    price_type: str = "fixed"  # public.price_type
    address_text: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None


class JobStatusUpdate(BaseModel):
    status: str  # public.job_status


class BidCreate(BaseModel):
    amount_cents: int
    message: Optional[str] = None


class HireRequest(BaseModel):
    job_id: uuid.UUID
    bid_id: uuid.UUID


class KycDocCreate(BaseModel):
    doc_type: str  # public.kyc_doc_type
    doc_subtype: Optional[str] = None
    storage_path: str
    doc_number: Optional[str] = None


class RatingCreate(BaseModel):
    job_id: uuid.UUID
    target_id: uuid.UUID
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None


class ComplaintCreate(BaseModel):
    target_user_id: Optional[uuid.UUID] = None
    job_id: Optional[uuid.UUID] = None
    complaint_type: str  # public.complaint_type
    severity_level: int = 1
    subject: str
    description: Optional[str] = None
    evidence_files: Optional[List[str]] = None


class AdminFlagUpdate(BaseModel):
    is_flagged: bool
    reason: Optional[str] = None


class AdminKycReview(BaseModel):
    status: str  # "verified", "rejected"
    reason: Optional[str] = None


class AdminComplaintUpdate(BaseModel):
    status: str  # public.complaint_status
    resolution_notes: Optional[str] = None


class PushTokenCreate(BaseModel):
    token: str
    device_type: Optional[str] = None


class MessageCreate(BaseModel):
    content: str


# -------------------------------------------------------------------
# Simple Redis helper (we can extend later for caching)
# -------------------------------------------------------------------


async def get_redis() -> Optional[redis.Redis]:
    return getattr(app.state, "redis", None)


# -------------------------------------------------------------------
# Health
# -------------------------------------------------------------------


@app.get("/health", tags=["system"])
async def health(conn: asyncpg.Connection = Depends(get_db)):
    await conn.fetchval("SELECT 1")
    return {"ok": True, "status": "healthy"}


# -------------------------------------------------------------------
# Auth / User onboarding
# -------------------------------------------------------------------


@app.post("/api/auth/upsert_user", tags=["auth"])
async def upsert_user(
    user_token: dict = Depends(require_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Called from frontend after Supabase login.
    Creates/updates row in public.users.
    """
    uid = uuid.UUID(user_token["sub"])
    email = user_token.get("email")

    row = await conn.fetchrow("SELECT id FROM public.users WHERE id = $1", uid)
    if row:
        return {"ok": True, "data": {"id": str(uid), "email": email}}

    await conn.execute(
        """
        INSERT INTO public.users (id, email, role)
        VALUES ($1, $2, 'customer')
        ON CONFLICT (id) DO NOTHING
        """,
        uid,
        email,
    )

    # also init wallet row
    await conn.execute(
        """
        INSERT INTO public.wallets (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
        """,
        uid,
    )

    return {"ok": True, "data": {"id": str(uid), "email": email}}


# -------------------------------------------------------------------
# /api/me – profile + worker info + governance + kyc + wallet
# -------------------------------------------------------------------


@app.get("/api/me", tags=["me"])
async def get_me(
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]

    worker = await conn.fetchrow(
        "SELECT * FROM public.worker_profiles WHERE user_id = $1",
        uid,
    )

    gov = await conn.fetchrow(
        "SELECT * FROM public.governance_stats WHERE user_id = $1",
        uid,
    )

    wallet = await conn.fetchrow(
        "SELECT * FROM public.wallets WHERE user_id = $1",
        uid,
    )

    kyc_docs = await conn.fetch(
        """
        SELECT id, doc_type, doc_subtype, storage_path, status, uploaded_at
        FROM public.kyc_documents
        WHERE user_id = $1
        ORDER BY uploaded_at DESC
        """,
        uid,
    )

    return {
        "ok": True,
        "data": {
            "user": {
                "id": str(user["id"]),
                "email": user["email"],
                "full_name": user["full_name"],
                "role": user["role"],
            },
            "worker_profile": dict(worker) if worker else None,
            "governance": dict(gov) if gov else None,
            "wallet": dict(wallet) if wallet else None,
            "kyc_documents": [dict(r) for r in kyc_docs],
        },
    }


@app.patch("/api/me/profile", tags=["me"])
async def update_profile(
    payload: ProfileUpdate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    fields = payload.dict(exclude_unset=True)
    if not fields:
        return {"ok": True, "data": None}

    cols = []
    vals: List[Any] = []
    i = 1
    for k, v in fields.items():
        cols.append(f"{k} = ${i}")
        vals.append(v)
        i += 1
    vals.append(uid)

    query = f"UPDATE public.users SET {', '.join(cols)} WHERE id = ${i} RETURNING *"
    row = await conn.fetchrow(query, *vals)
    return {"ok": True, "data": dict(row)}


@app.patch("/api/me/worker", tags=["me"])
async def upsert_worker_profile(
    payload: WorkerProfileUpdate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    # Promote to worker role if needed
    if user["role"] != "worker":
        await conn.execute(
            "UPDATE public.users SET role = 'worker' WHERE id = $1",
            uid,
        )

    fields = payload.dict(exclude_unset=True)
    if not fields:
        # ensure row exists at least
        await conn.execute(
            """
            INSERT INTO public.worker_profiles (user_id)
            VALUES ($1)
            ON CONFLICT (user_id) DO NOTHING
            """,
            uid,
        )
        row = await conn.fetchrow(
            "SELECT * FROM public.worker_profiles WHERE user_id = $1",
            uid,
        )
        return {"ok": True, "data": dict(row)}

    cols_insert = ["user_id"]
    vals_insert: List[Any] = [uid]
    params_insert = ["$1"]

    set_parts = []
    vals_update: List[Any] = []
    idx = 2

    for k, v in fields.items():
        cols_insert.append(k)
        params_insert.append(f"${idx}")
        vals_insert.append(v)

        set_parts.append(f"{k} = EXCLUDED.{k}")
        idx += 1

    query = f"""
    INSERT INTO public.worker_profiles ({', '.join(cols_insert)})
    VALUES ({', '.join(params_insert)})
    ON CONFLICT (user_id) DO UPDATE
    SET {', '.join(set_parts)}
    RETURNING *;
    """

    row = await conn.fetchrow(query, *vals_insert)
    return {"ok": True, "data": dict(row)}


@app.patch("/api/me/location", tags=["me"])
async def update_location(
    payload: LocationUpdate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    lat = payload.lat
    lon = payload.lon

    row = await conn.fetchrow(
        """
        INSERT INTO public.user_locations (user_id, location)
        VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3)::geography, 4326))
        ON CONFLICT (user_id) DO UPDATE
          SET location = EXCLUDED.location,
              last_updated_at = now()
        RETURNING *
        """,
        uid,
        lon,
        lat,
    )
    return {"ok": True, "data": dict(row)}


# -------------------------------------------------------------------
# KYC
# -------------------------------------------------------------------


@app.get("/api/kyc", tags=["kyc"])
async def get_kyc(
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    docs = await conn.fetch(
        """
        SELECT id, doc_type, doc_subtype, storage_path, status, uploaded_at
        FROM public.kyc_documents
        WHERE user_id = $1
        ORDER BY uploaded_at DESC
        """,
        uid,
    )
    wp = await conn.fetchrow(
        "SELECT kyc_status, kyc_verified_at FROM public.worker_profiles WHERE user_id = $1",
        uid,
    )
    return {
        "ok": True,
        "data": {
            "kyc_status": wp["kyc_status"] if wp else "none",
            "kyc_verified_at": wp["kyc_verified_at"] if wp else None,
            "documents": [dict(r) for r in docs],
            "bucket": KYC_DOCS_BUCKET,
        },
    }


@app.post("/api/kyc", tags=["kyc"])
async def create_kyc_doc(
    payload: KycDocCreate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    row = await conn.fetchrow(
        """
        INSERT INTO public.kyc_documents
          (user_id, doc_type, doc_subtype, storage_path, doc_number, status)
        VALUES ($1, $2::public.kyc_doc_type, $3, $4, $5, 'pending')
        RETURNING *
        """,
        uid,
        payload.doc_type,
        payload.doc_subtype,
        payload.storage_path,
        payload.doc_number,
    )
    return {"ok": True, "data": dict(row)}


# -------------------------------------------------------------------
# Jobs + Bids
# -------------------------------------------------------------------


@app.post("/api/jobs", tags=["jobs"])
async def create_job(
    payload: JobCreate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    services = payload.services_required or []

    loc_expr = "NULL"
    params: List[Any] = [uid]
    idx = 2

    if not payload.is_remote and payload.lat is not None and payload.lon is not None:
        loc_expr = f"ST_SetSRID(ST_MakePoint(${idx + 1}, ${idx})::geography, 4326)"
        params.extend([payload.lat, payload.lon])
        idx += 2

    query = f"""
    INSERT INTO public.jobs (
      customer_id,
      title,
      description,
      category,
      profession_required,
      services_required,
      job_location,
      is_remote,
      budget_min_cents,
      budget_max_cents,
      price_type,
      address_text,
      city,
      pincode
    )
    VALUES (
      $1,
      ${idx},
      ${idx+1},
      ${idx+2},
      ${idx+3},
      ${idx+4},
      {loc_expr},
      ${idx+5},
      ${idx+6},
      ${idx+7},
      ${idx+8}::public.price_type,
      ${idx+9},
      ${idx+10},
      ${idx+11}
    )
    RETURNING *;
    """

    params.extend(
        [
            payload.title,
            payload.description,
            payload.category,
            payload.profession_required,
            services,
            payload.is_remote,
            payload.budget_min_cents,
            payload.budget_max_cents,
            payload.price_type,
            payload.address_text,
            payload.city,
            payload.pincode,
        ]
    )

    row = await conn.fetchrow(query, *params)
    return {"ok": True, "data": dict(row)}


@app.get("/api/jobs/{job_id}", tags=["jobs"])
async def get_job(
    job_id: uuid.UUID,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    row = await conn.fetchrow(
        """
        SELECT j.*, u.full_name AS customer_name
        FROM public.jobs j
        JOIN public.users u ON u.id = j.customer_id
        WHERE j.id = $1
        """,
        job_id,
    )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return {"ok": True, "data": dict(row)}


@app.patch("/api/jobs/{job_id}/status", tags=["jobs"])
async def update_job_status(
    job_id: uuid.UUID,
    payload: JobStatusUpdate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    row = await conn.fetchrow(
        """
        UPDATE public.jobs
        SET status = $1::public.job_status
        WHERE id = $2 AND customer_id = $3
        RETURNING *
        """,
        payload.status,
        job_id,
        uid,
    )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found or not yours")
    return {"ok": True, "data": dict(row)}


@app.post("/api/jobs/{job_id}/bids", tags=["bids"])
async def place_bid(
    job_id: uuid.UUID,
    payload: BidCreate,
    worker: dict = Depends(require_worker),
    conn: asyncpg.Connection = Depends(get_db),
):
    worker_id = worker["id"]

    # optional sanity check: job open
    job = await conn.fetchrow(
        "SELECT status FROM public.jobs WHERE id = $1",
        job_id,
    )
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    if job["status"] not in ("open", "bidding"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Job is not open for bidding")

    row = await conn.fetchrow(
        """
        INSERT INTO public.bids (job_id, worker_id, amount_cents, message)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        """,
        job_id,
        worker_id,
        payload.amount_cents,
        payload.message,
    )
    return {"ok": True, "data": dict(row)}


@app.get("/api/jobs/{job_id}/bids", tags=["bids"])
async def list_bids(
    job_id: uuid.UUID,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    # only customer who owns job OR worker who bid can see
    uid = user["id"]
    job = await conn.fetchrow(
        "SELECT customer_id FROM public.jobs WHERE id = $1",
        job_id,
    )
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")

    is_customer = job["customer_id"] == uid

    rows = await conn.fetch(
        """
        SELECT b.*, u.full_name AS worker_name
        FROM public.bids b
        JOIN public.users u ON u.id = b.worker_id
        WHERE job_id = $1
        """,
        job_id,
    )

    if not is_customer:
        # filter to user's own bids
        rows = [r for r in rows if r["worker_id"] == uid]

    return {"ok": True, "data": [dict(r) for r in rows]}


@app.post("/api/jobs/hire", tags=["jobs"])
async def hire_worker(
    payload: HireRequest,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]

    job = await conn.fetchrow(
        "SELECT id, customer_id, status FROM public.jobs WHERE id = $1",
        payload.job_id,
    )
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    if job["customer_id"] != uid:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your job")
    if job["status"] not in ("open", "bidding"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Job cannot be hired now")

    bid = await conn.fetchrow(
        "SELECT worker_id, amount_cents FROM public.bids WHERE id = $1 AND job_id = $2",
        payload.bid_id,
        payload.job_id,
    )
    if not bid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bid not found")

    worker_id = bid["worker_id"]
    amount = bid["amount_cents"]

    async with conn.transaction():
        await conn.execute(
            """
            UPDATE public.bids
            SET status = 'accepted'
            WHERE id = $1
            """,
            payload.bid_id,
        )
        await conn.execute(
            """
            UPDATE public.jobs
            SET worker_id = $1, status = 'assigned'
            WHERE id = $2
            """,
            worker_id,
            payload.job_id,
        )
        # payment init + escrow will be handled separately

    return {
        "ok": True,
        "data": {
            "job_id": str(payload.job_id),
            "worker_id": str(worker_id),
            "amount_cents": amount,
        },
    }


# -------------------------------------------------------------------
# Search (workers & jobs)
# -------------------------------------------------------------------


@app.get("/api/search", tags=["search"])
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
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    rows = await conn.fetch(
        """
        SELECT * FROM public.search_workers_v4(
            $1, $2, $3,
            $4, $5,
            $6, $7,
            $8, $9
        )
        """,
        lat,
        lon,
        radius_meters,
        profession,
        service,
        min_rate,
        max_rate,
        gender,
        order_by,
    )
    return {"ok": True, "data": [dict(r) for r in rows]}


@app.get("/api/jobs/search", tags=["search", "jobs"])
async def search_jobs(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_meters: int = Query(20000),
    query: Optional[str] = Query(None),
    min_budget: Optional[int] = Query(None),
    profession: Optional[str] = Query(None),
    services: Optional[str] = Query(
        None,
        description="Comma separated services, e.g. 'plumbing,cleaning'",
    ),
    only_open: bool = Query(True),
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    services_arr = None
    if services:
        services_arr = [s.strip() for s in services.split(",") if s.strip()]

    rows = await conn.fetch(
        """
        SELECT * FROM public.search_jobs_v4(
          $1, $2, $3,
          $4,
          $5,
          $6,
          $7,
          $8
        )
        """,
        lat,
        lon,
        radius_meters,
        query,
        min_budget,
        profession,
        services_arr,
        only_open,
    )
    return {"ok": True, "data": [dict(r) for r in rows]}


# -------------------------------------------------------------------
# Ratings & Complaints
# -------------------------------------------------------------------


@app.post("/api/ratings", tags=["ratings"])
async def create_rating(
    payload: RatingCreate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    row = await conn.fetchrow(
        """
        INSERT INTO public.ratings (job_id, reviewer_id, target_id, rating, comment)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        """,
        payload.job_id,
        uid,
        payload.target_id,
        payload.rating,
        payload.comment,
    )
    return {"ok": True, "data": dict(row)}


@app.post("/api/complaints", tags=["complaints"])
async def create_complaint(
    payload: ComplaintCreate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    row = await conn.fetchrow(
        """
        INSERT INTO public.complaints
          (reporter_id, target_user_id, job_id,
           complaint_type, severity_level,
           subject, description, evidence_files)
        VALUES (
          $1, $2, $3,
          $4::public.complaint_type, $5,
          $6, $7, $8
        )
        RETURNING *
        """,
        uid,
        payload.target_user_id,
        payload.job_id,
        payload.complaint_type,
        payload.severity_level,
        payload.subject,
        payload.description,
        payload.evidence_files or [],
    )
    return {"ok": True, "data": dict(row)}


# -------------------------------------------------------------------
# Notifications / push tokens
# -------------------------------------------------------------------


@app.post("/api/notifications/device", tags=["notifications"])
async def register_push_token(
    payload: PushTokenCreate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    await conn.execute(
        """
        INSERT INTO public.push_tokens (user_id, token, device_type)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, token) DO UPDATE
          SET device_type = EXCLUDED.device_type,
              last_used_at = now()
        """,
        uid,
        payload.token,
        payload.device_type,
    )
    return {"ok": True}


# -------------------------------------------------------------------
# Chat REST (for history + creating chat per job)
# -------------------------------------------------------------------


@app.post("/api/jobs/{job_id}/chat", tags=["chat"])
async def get_or_create_chat_for_job(
    job_id: uuid.UUID,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    job = await conn.fetchrow(
        "SELECT customer_id, worker_id FROM public.jobs WHERE id = $1",
        job_id,
    )
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")

    if uid not in (job["customer_id"], job["worker_id"]):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not part of this job")

    chat = await conn.fetchrow(
        "SELECT * FROM public.chats WHERE job_id = $1",
        job_id,
    )
    if not chat:
        chat = await conn.fetchrow(
            """
            INSERT INTO public.chats (job_id)
            VALUES ($1)
            RETURNING *
            """,
            job_id,
        )
    return {"ok": True, "data": dict(chat)}


@app.get("/api/chats", tags=["chat"])
async def list_my_chats(
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    rows = await conn.fetch(
        """
        SELECT
          c.id AS chat_id,
          j.id AS job_id,
          j.title,
          j.customer_id,
          j.worker_id,
          j.status,
          j.created_at,
          (
            SELECT m.content
            FROM public.messages m
            WHERE m.chat_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
          ) AS last_message,
          (
            SELECT m.created_at
            FROM public.messages m
            WHERE m.chat_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
          ) AS last_message_at
        FROM public.chats c
        JOIN public.jobs j ON j.id = c.job_id
        WHERE j.customer_id = $1 OR j.worker_id = $1
        ORDER BY last_message_at DESC NULLS LAST, j.created_at DESC
        """,
        uid,
    )
    return {"ok": True, "data": [dict(r) for r in rows]}


@app.get("/api/chats/{chat_id}/messages", tags=["chat"])
async def get_chat_messages(
    chat_id: uuid.UUID,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    job = await conn.fetchrow(
        """
        SELECT j.customer_id, j.worker_id
        FROM public.chats c
        JOIN public.jobs j ON j.id = c.job_id
        WHERE c.id = $1
        """,
        chat_id,
    )
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chat not found")
    if uid not in (job["customer_id"], job["worker_id"]):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not part of this chat")

    rows = await conn.fetch(
        """
        SELECT *
        FROM public.messages
        WHERE chat_id = $1
        ORDER BY created_at ASC
        """,
        chat_id,
    )
    return {"ok": True, "data": [dict(r) for r in rows]}


@app.post("/api/chats/{chat_id}/messages", tags=["chat"])
async def send_message_http(
    chat_id: uuid.UUID,
    payload: MessageCreate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
    r: Optional[redis.Redis] = Depends(get_redis),
):
    uid = user["id"]
    job = await conn.fetchrow(
        """
        SELECT j.customer_id, j.worker_id
        FROM public.chats c
        JOIN public.jobs j ON j.id = c.job_id
        WHERE c.id = $1
        """,
        chat_id,
    )
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chat not found")
    if uid not in (job["customer_id"], job["worker_id"]):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not part of this chat")

    row = await conn.fetchrow(
        """
        INSERT INTO public.messages (chat_id, sender_id, content)
        VALUES ($1, $2, $3)
        RETURNING *
        """,
        chat_id,
        uid,
        payload.content,
    )

    message_payload = {
        "id": str(row["id"]),
        "chat_id": str(chat_id),
        "sender_id": str(uid),
        "content": row["content"],
        "created_at": row["created_at"].isoformat(),
        "via": "http",
    }

    # fan-out via Redis for connected WebSocket clients
    if r:
        await r.publish(f"chat:{chat_id}", json.dumps(message_payload))

    return {"ok": True, "data": message_payload}


# -------------------------------------------------------------------
# WebSocket Chat (Redis pub/sub)
# -------------------------------------------------------------------


@app.websocket("/ws/chat/{chat_id}")
async def websocket_chat(
    websocket: WebSocket,
    chat_id: str = Path(...),
):
    """
    WebSocket endpoint:
    - Client MUST send Authorization: Bearer <token> header.
    - Uses Redis pub/sub for multi-instance fan-out.
    """
    await websocket.accept()

    # Extract & verify token from headers (since dependencies don't run for WS)
    auth_header = websocket.headers.get("authorization") or websocket.headers.get(
        "Authorization"
    )
    if not auth_header or not auth_header.lower().startswith("bearer "):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience=SUPABASE_JWT_AUD,
        )
    except JWTError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = uuid.UUID(payload["sub"])

    # membership check
    conn: asyncpg.Connection = await app.state.db_pool.acquire()
    try:
        job = await conn.fetchrow(
            """
            SELECT j.customer_id, j.worker_id
            FROM public.chats c
            JOIN public.jobs j ON j.id = c.job_id
            WHERE c.id = $1
            """,
            uuid.UUID(chat_id),
        )
        if not job or user_id not in (job["customer_id"], job["worker_id"]):
            await app.state.db_pool.release(conn)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except Exception:
        await app.state.db_pool.release(conn)
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        return
    finally:
        # will reacquire per write when needed
        await app.state.db_pool.release(conn)

    r: Optional[redis.Redis] = getattr(app.state, "redis", None)
    if not r:
        # Without Redis, just echo between this client and DB
        channel_name = None
    else:
        channel_name = f"chat:{chat_id}"
        pubsub = r.pubsub()
        await pubsub.subscribe(channel_name)

        async def reader():
            try:
                async for msg in pubsub.listen():
                    if msg["type"] != "message":
                        continue
                    await websocket.send_text(msg["data"])
            except asyncio.CancelledError:
                pass

        reader_task = asyncio.create_task(reader())

    try:
        while True:
            incoming = await websocket.receive_text()
            # insert into DB
            conn = await app.state.db_pool.acquire()
            try:
                row = await conn.fetchrow(
                    """
                    INSERT INTO public.messages (chat_id, sender_id, content)
                    VALUES ($1, $2, $3)
                    RETURNING *
                    """,
                    uuid.UUID(chat_id),
                    user_id,
                    incoming,
                )
            finally:
                await app.state.db_pool.release(conn)

            payload_out = {
                "id": str(row["id"]),
                "chat_id": chat_id,
                "sender_id": str(user_id),
                "content": row["content"],
                "created_at": row["created_at"].isoformat(),
                "via": "ws",
            }

            if r and channel_name:
                await r.publish(channel_name, json.dumps(payload_out))
            else:
                # single-instance fallback
                await websocket.send_text(json.dumps(payload_out))

    except WebSocketDisconnect:
        pass
    finally:
        if r and channel_name:
            reader_task.cancel()
            await pubsub.unsubscribe(channel_name)
            await pubsub.close()
        await websocket.close()


# -------------------------------------------------------------------
# Admin Endpoints
# -------------------------------------------------------------------

# --- KYC ---


@app.get("/api/admin/kyc/pending", tags=["admin", "kyc"])
async def admin_get_pending_kyc(
    user: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Get all pending KYC documents for review.
    """
    rows = await conn.fetch(
        """
        SELECT 
            kd.*, 
            u.full_name, 
            u.email,
            wp.worker_type,
            wp.tier
        FROM public.kyc_documents kd
        JOIN public.users u ON u.id = kd.user_id
        LEFT JOIN public.worker_profiles wp ON wp.user_id = kd.user_id
        WHERE kd.status = 'pending'
        ORDER BY kd.uploaded_at ASC
        """
    )
    return {"ok": True, "data": [dict(r) for r in rows]}


@app.get("/api/admin/kyc/user/{user_id}", tags=["admin", "kyc"])
async def admin_get_user_kyc(
    user_id: uuid.UUID,
    admin: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Full KYC + worker info for a specific user.
    """
    user_row = await conn.fetchrow(
        "SELECT id, email, full_name, role FROM public.users WHERE id = $1",
        user_id,
    )
    if not user_row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    docs = await conn.fetch(
        """
        SELECT *
        FROM public.kyc_documents
        WHERE user_id = $1
        ORDER BY uploaded_at DESC
        """,
        user_id,
    )

    wp = await conn.fetchrow(
        "SELECT * FROM public.worker_profiles WHERE user_id = $1",
        user_id,
    )

    return {
        "ok": True,
        "data": {
            "user": dict(user_row),
            "worker_profile": dict(wp) if wp else None,
            "kyc_documents": [dict(d) for d in docs],
        },
    }


@app.post("/api/admin/kyc/{doc_id}/review", tags=["admin", "kyc"])
async def review_kyc_document(
    doc_id: uuid.UUID,
    payload: AdminKycReview,
    user: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Verify or Reject a KYC document.
    Triggers in DB will automatically update worker_profiles.kyc_status based on document status.
    """
    row = await conn.fetchrow(
        """
        UPDATE public.kyc_documents
        SET status = $1::public.kyc_status,
            rejection_reason = $2,
            reviewed_by = $3,
            reviewed_at = now()
        WHERE id = $4
        RETURNING *
        """,
        payload.status,
        payload.reason,
        user["id"],
        doc_id,
    )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")

    return {"ok": True, "data": dict(row)}


# --- Complaints ---


@app.get("/api/admin/complaints", tags=["admin", "complaints"])
async def get_complaints(
    status_filter: Optional[str] = Query(
        None, description="pending, investigating, resolved_..."
    ),
    min_severity: int = Query(1, ge=1),
    user: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    List complaints, optionally filtered by status and severity.
    """
    base_query = """
        SELECT 
            c.*, 
            r.full_name as reporter_name,
            r.email as reporter_email,
            t.full_name as target_name,
            t.email as target_email
        FROM public.complaints c
        JOIN public.users r ON r.id = c.reporter_id
        LEFT JOIN public.users t ON t.id = c.target_user_id
        WHERE c.severity_level >= $1
    """
    params: List[Any] = [min_severity]

    if status_filter:
        base_query += " AND c.status = $2::public.complaint_status"
        params.append(status_filter)

    base_query += " ORDER BY c.created_at DESC"

    rows = await conn.fetch(base_query, *params)

    return {"ok": True, "data": [dict(r) for r in rows]}


@app.patch(
    "/api/admin/complaints/{complaint_id}", tags=["admin", "complaints"]
)
async def admin_update_complaint(
    complaint_id: uuid.UUID,
    payload: AdminComplaintUpdate,
    admin: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Admin updates complaint status and resolution notes.
    """
    row = await conn.fetchrow(
        """
        UPDATE public.complaints
        SET
          status = $2::public.complaint_status,
          resolution_notes = $3,
          resolved_by = $4,
          resolved_at = now()
        WHERE id = $1
        RETURNING *
        """,
        complaint_id,
        payload.status,
        payload.resolution_notes,
        admin["id"],
    )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Complaint not found")

    return {"ok": True, "data": dict(row)}


# --- Ratings ---


@app.get("/api/admin/ratings", tags=["admin", "ratings"])
async def admin_list_ratings(
    target_id: Optional[uuid.UUID] = Query(None),
    reviewer_id: Optional[uuid.UUID] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    admin: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    List ratings (both 'user' and 'worker' since we unified into ratings).
    Filter by target_id or reviewer_id if needed.
    """
    where_clauses = []
    params: List[Any] = []
    idx = 1

    if target_id:
        where_clauses.append(f"r.target_id = ${idx}")
        params.append(target_id)
        idx += 1
    if reviewer_id:
        where_clauses.append(f"r.reviewer_id = ${idx}")
        params.append(reviewer_id)
        idx += 1

    where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"

    query = f"""
    SELECT
      r.*,
      rev.full_name AS reviewer_name,
      rev.email AS reviewer_email,
      tgt.full_name AS target_name,
      tgt.email AS target_email
    FROM public.ratings r
    LEFT JOIN public.users rev ON rev.id = r.reviewer_id
    LEFT JOIN public.users tgt ON tgt.id = r.target_id
    WHERE {where_sql}
    ORDER BY r.created_at DESC
    LIMIT {limit}
    """

    rows = await conn.fetch(query, *params)
    return {"ok": True, "data": [dict(r) for r in rows]}


# --- Governance / Flags ---


@app.get(
    "/api/admin/users/{user_id}/governance", tags=["admin", "governance"]
)
async def admin_get_user_governance(
    user_id: uuid.UUID,
    admin: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Governance + latest ratings for a user.
    """
    user_row = await conn.fetchrow(
        "SELECT id, email, full_name, role, is_flagged FROM public.users WHERE id = $1",
        user_id,
    )
    if not user_row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    gov = await conn.fetchrow(
        "SELECT * FROM public.governance_stats WHERE user_id = $1",
        user_id,
    )

    latest_ratings = await conn.fetch(
        """
        SELECT r.*, u.full_name AS reviewer_name
        FROM public.ratings r
        JOIN public.users u ON u.id = r.reviewer_id
        WHERE r.target_id = $1
        ORDER BY r.created_at DESC
        LIMIT 20
        """,
        user_id,
    )

    return {
        "ok": True,
        "data": {
            "user": dict(user_row),
            "governance": dict(gov) if gov else None,
            "latest_ratings": [dict(r) for r in latest_ratings],
        },
    }


@app.patch("/api/admin/users/{user_id}/flag", tags=["admin", "governance"])
async def flag_user(
    user_id: uuid.UUID,
    payload: AdminFlagUpdate,
    user: dict = Depends(require_admin),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Manually flag or unflag a user (and keep governance_stats in sync).
    """
    async with conn.transaction():
        # ensure governance row exists
        gov_row = await conn.fetchrow(
            """
            INSERT INTO public.governance_stats (user_id)
            VALUES ($1)
            ON CONFLICT (user_id) DO UPDATE
              SET user_id = EXCLUDED.user_id
            RETURNING *
            """,
            user_id,
        )

        # update governance flags
        gov_row = await conn.fetchrow(
            """
            UPDATE public.governance_stats
            SET is_flagged = $2,
                flagged_reason = $3,
                last_flagged_at = CASE WHEN $2 THEN now() ELSE last_flagged_at END
            WHERE user_id = $1
            RETURNING *
            """,
            user_id,
            payload.is_flagged,
            payload.reason,
        )

        # Sync to users table for fast lookup
        await conn.execute(
            "UPDATE public.users SET is_flagged = $1 WHERE id = $2",
            payload.is_flagged,
            user_id,
        )

    return {"ok": True, "data": dict(gov_row)}