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
    UploadFile,
    File,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
# Added HTTPBearer and HTTPAuthorizationCredentials for Swagger UI Auth
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from supabase import create_client, Client

from dotenv import load_dotenv

# Import Auth Logic from your app/auth.py
# Ensure your folder structure is backend/app/auth.py and backend/app/main.py
from app.auth import (
    verify_and_decode_jwt,
    get_user_id_from_jwt,
    is_admin_token,
    SUPABASE_JWT_SECRET,
    SUPABASE_JWT_AUD,
)

load_dotenv()


# -------------------------------------------------------------------
# Config & Setup
# -------------------------------------------------------------------

logger = logging.getLogger("kaargar")
logging.basicConfig(level=logging.INFO)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

REDIS_URL = os.getenv("REDIS_URL")

# Supabase Storage Setup
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Initialize Supabase Client (Global)
supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    except Exception as e:
        logger.error(f"Failed to init Supabase client: {e}")
else:
    logger.warning("Supabase credentials missing. File uploads will fail.")

# Buckets
CHAT_MEDIA_BUCKET = "chat_media"
JOB_PROOF_BUCKET = "JOB_PROOF"
KYC_DOCS_BUCKET = "KYC_DOCS"

# CORS
raw_origins = os.getenv("CORS_ORIGINS", "")
if raw_origins.strip():
    ALLOWED_ORIGINS = [o.strip() for o in raw_origins.split(",") if o.strip()]
else:
    ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://kaargar.vercel.app",
    ]

app = FastAPI(title="KAARGAR API v5")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# -------------------------------------------------------------------
# Lifecycle & Helpers
# -------------------------------------------------------------------

@app.on_event("startup")
async def startup_event():
    logger.info("Starting up: creating DB pool and Redis client")
    app.state.db_pool = await asyncpg.create_pool(
        DATABASE_URL, min_size=2, max_size=20, command_timeout=30,
        server_settings={"application_name": "kaargar_api"}
    )
    if REDIS_URL:
        app.state.redis = redis.from_url(REDIS_URL, decode_responses=True)
        logger.info("Connected Redis")
    else:
        app.state.redis = None
        logger.warning("REDIS_URL not set; Realtime features disabled")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down")
    if getattr(app.state, "db_pool", None):
        await app.state.db_pool.close()
    if getattr(app.state, "redis", None):
        await app.state.redis.close()

async def get_db():
    pool = app.state.db_pool
    async with pool.acquire() as conn:
        yield conn

async def get_redis() -> Optional[redis.Redis]:
    return getattr(app.state, "redis", None)

async def upload_file_to_supabase(bucket: str, file: UploadFile, path_prefix: str) -> str:
    """Helper to upload file and return public URL"""
    if not supabase:
        raise HTTPException(500, "Storage service not configured")
    
    file_content = await file.read()
    file_ext = file.filename.split(".")[-1]
    # Sanitized filename
    file_path = f"{path_prefix}/{uuid.uuid4()}.{file_ext}"
    
    try:
        # Use upsert=True just in case
        supabase.storage.from_(bucket).upload(
            file_path, file_content, {"content-type": file.content_type, "upsert": "true"}
        )
        # Get Public URL
        return supabase.storage.from_(bucket).get_public_url(file_path)
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(500, "File upload failed")

# -------------------------------------------------------------------
# Auth Dependencies (Integrated with app/auth.py)
# -------------------------------------------------------------------

# Define the security scheme for Swagger UI
auth_scheme = HTTPBearer()

def _get_token_str(request: Request) -> str:
    """
    Legacy helper kept for WebSocket endpoints where HTTPBearer doesn't work directly via headers in same way.
    For standard HTTP endpoints, we now use auth_scheme dependency.
    """
    auth_header = request.headers.get("authorization")
    if not auth_header:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing Authorization header")
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Authorization header")
    return parts[1]

async def require_user(
    token: HTTPAuthorizationCredentials = Depends(auth_scheme)
) -> dict:
    """
    Decodes JWT using the robust verify_and_decode_jwt from auth.py.
    Using Depends(auth_scheme) automatically adds the Authorize button to Swagger UI.
    """
    return verify_and_decode_jwt(token.credentials)

async def require_db_user(
    token: dict = Depends(require_user),
    conn: asyncpg.Connection = Depends(get_db),
) -> dict:
    uid = uuid.UUID(token["sub"])
    row = await conn.fetchrow(
        "SELECT id, email, full_name, role FROM public.users WHERE id = $1", uid
    )
    if not row:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User not onboarded")
    
    return {
        "id": row["id"], 
        "email": row["email"], 
        "full_name": row["full_name"], 
        "role": row["role"],
        "jwt": token
    }

async def require_worker(
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
) -> dict:
    if user["role"] != "worker":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Worker account required")
    
    wp = await conn.fetchrow("SELECT * FROM public.worker_profiles WHERE user_id = $1", user["id"])
    if not wp:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Worker profile not set up")
    
    # Strict KYC check
    if wp["kyc_status"] != "verified":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "KYC not verified")
        
    return {**user, "worker_profile": wp}

async def require_admin(user: dict = Depends(require_db_user)) -> dict:
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
    gender: Optional[str] = Field(default=None, pattern="^(male|female|other)$")

class WorkerProfileUpdate(BaseModel):
    worker_type: Optional[str] = None
    tier: Optional[str] = None
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
    accepts_direct_hire: Optional[bool] = None
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
    price_type: str = "fixed"
    address_text: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None

class JobStatusUpdate(BaseModel):
    status: str

class BidCreate(BaseModel):
    amount_cents: int
    message: Optional[str] = None

class HireRequest(BaseModel):
    job_id: uuid.UUID
    bid_id: uuid.UUID

# Unified Booking Model
class BookJobDetails(JobCreate):
    pass

class BookJobRequest(BaseModel):
    worker_id: uuid.UUID
    job_details: BookJobDetails

class KycDocCreate(BaseModel):
    doc_type: str
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
    complaint_type: str
    severity_level: int = 1
    subject: str
    description: Optional[str] = None
    evidence_files: Optional[List[str]] = None

class AdminFlagUpdate(BaseModel):
    is_flagged: bool
    reason: Optional[str] = None

class AdminKycReview(BaseModel):
    status: str
    reason: Optional[str] = None

class AdminComplaintUpdate(BaseModel):
    status: str
    resolution_notes: Optional[str] = None

class PushTokenCreate(BaseModel):
    token: str
    device_type: Optional[str] = None

class MessageCreate(BaseModel):
    content: str

# Job Execution & Wallet Models
class JobProofSubmit(BaseModel):
    worker_comment: Optional[str] = None
    worker_proof_imgs: List[str] = [] 
    bill_details: List[Dict[str, Any]] = []

class JobProofApprove(BaseModel):
    customer_comment: Optional[str] = None
    rating: int = Field(..., ge=1, le=5)

# -------------------------------------------------------------------
# System Endpoints
# -------------------------------------------------------------------

@app.get("/health", tags=["system"])
async def health(conn: asyncpg.Connection = Depends(get_db)):
    await conn.fetchval("SELECT 1")
    return {"ok": True, "status": "healthy"}

# -------------------------------------------------------------------
# Auth & User Profile
# -------------------------------------------------------------------

@app.post("/api/auth/upsert_user", tags=["auth"])
async def upsert_user(
    user_token: dict = Depends(require_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = uuid.UUID(user_token["sub"])
    email = user_token.get("email")
    
    # Ensure user exists
    await conn.execute(
        "INSERT INTO public.users (id, email, role) VALUES ($1, $2, 'customer') ON CONFLICT (id) DO NOTHING",
        uid, email
    )
    # Ensure wallet exists
    await conn.execute(
        "INSERT INTO public.wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
        uid
    )
    return {"ok": True, "data": {"id": str(uid), "email": email}}

@app.get("/api/me", tags=["me"])
async def get_me(user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)):
    uid = user["id"]
    worker = await conn.fetchrow("SELECT * FROM public.worker_profiles WHERE user_id = $1", uid)
    gov = await conn.fetchrow("SELECT * FROM public.governance_stats WHERE user_id = $1", uid)
    wallet = await conn.fetchrow("SELECT * FROM public.wallets WHERE user_id = $1", uid)
    kyc_docs = await conn.fetch("SELECT id, doc_type, doc_subtype, storage_path, status, uploaded_at FROM public.kyc_documents WHERE user_id = $1 ORDER BY uploaded_at DESC", uid)

    return {
        "ok": True,
        "data": {
            "user": user,
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
    if not fields: return {"ok": True}
    
    cols, vals = [], []
    for i, (k, v) in enumerate(fields.items(), start=1):
        cols.append(f"{k} = ${i}")
        vals.append(v)
    vals.append(uid)
    
    query = f"UPDATE public.users SET {', '.join(cols)} WHERE id = ${len(vals)} RETURNING *"
    row = await conn.fetchrow(query, *vals)
    return {"ok": True, "data": dict(row)}

@app.patch("/api/me/worker", tags=["me"])
async def upsert_worker_profile(
    payload: WorkerProfileUpdate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    if user["role"] != "worker":
        await conn.execute("UPDATE public.users SET role = 'worker' WHERE id = $1", uid)

    fields = payload.dict(exclude_unset=True)
    if not fields:
        # Ensure exists
        await conn.execute("INSERT INTO public.worker_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", uid)
        row = await conn.fetchrow("SELECT * FROM public.worker_profiles WHERE user_id = $1", uid)
        return {"ok": True, "data": dict(row)}

    cols, params, vals, sets = ["user_id"], ["$1"], [uid], []
    for i, (k, v) in enumerate(fields.items(), start=2):
        cols.append(k)
        params.append(f"${i}")
        vals.append(v)
        sets.append(f"{k} = EXCLUDED.{k}")

    query = f"""
    INSERT INTO public.worker_profiles ({', '.join(cols)}) VALUES ({', '.join(params)})
    ON CONFLICT (user_id) DO UPDATE SET {', '.join(sets)} RETURNING *;
    """
    row = await conn.fetchrow(query, *vals)
    return {"ok": True, "data": dict(row)}

@app.patch("/api/me/location", tags=["me"])
async def update_location(
    payload: LocationUpdate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    await conn.execute(
        """
        INSERT INTO public.user_locations (user_id, location)
        VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3)::geography, 4326))
        ON CONFLICT (user_id) DO UPDATE SET location = EXCLUDED.location, last_updated_at = now()
        """,
        user["id"], payload.lon, payload.lat
    )
    return {"ok": True}

# -------------------------------------------------------------------
# File Uploads (New)
# -------------------------------------------------------------------

@app.post("/api/upload/kyc", tags=["upload"])
async def upload_kyc_doc(
    file: UploadFile = File(...),
    user: dict = Depends(require_db_user),
):
    """Uploads to KYC_DOCS bucket"""
    url = await upload_file_to_supabase(KYC_DOCS_BUCKET, file, f"{user['id']}")
    return {"ok": True, "url": url}

@app.post("/api/upload/proof", tags=["upload"])
async def upload_job_proof(
    job_id: uuid.UUID = Query(...),
    file: UploadFile = File(...),
    user: dict = Depends(require_worker), # Only workers upload proofs
):
    """Uploads to JOB_PROOF bucket"""
    url = await upload_file_to_supabase(JOB_PROOF_BUCKET, file, f"{job_id}")
    return {"ok": True, "url": url}

@app.post("/api/upload/chat", tags=["upload"])
async def upload_chat_media(
    chat_id: uuid.UUID = Query(...),
    file: UploadFile = File(...),
    user: dict = Depends(require_db_user),
):
    """Uploads to chat_media bucket"""
    url = await upload_file_to_supabase(CHAT_MEDIA_BUCKET, file, f"{chat_id}")
    return {"ok": True, "url": url}

# -------------------------------------------------------------------
# Search
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
    conn: asyncpg.Connection = Depends(get_db),
    user: dict = Depends(require_db_user),
):
    rows = await conn.fetch(
        "SELECT * FROM public.search_workers_v4($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        lat, lon, radius_meters, profession, service, min_rate, max_rate, gender, order_by
    )
    return {"ok": True, "data": [dict(r) for r in rows]}

@app.get("/api/jobs/search", tags=["search"])
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

# -------------------------------------------------------------------
# Jobs, Booking, Hiring (Core Logic)
# -------------------------------------------------------------------

@app.post("/api/jobs", tags=["jobs"])
async def create_job(
    payload: JobCreate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    """Standard Job Post (Open for bidding)"""
    uid = user["id"]
    loc_expr = "NULL"
    params = [uid]
    idx = 2
    
    if not payload.is_remote and payload.lat and payload.lon:
        loc_expr = f"ST_SetSRID(ST_MakePoint(${idx+1}, ${idx})::geography, 4326)"
        params.extend([payload.lat, payload.lon])
        idx += 2
        
    query = f"""
    INSERT INTO public.jobs (
      customer_id, title, description, category, profession_required, services_required,
      job_location, is_remote, budget_min_cents, budget_max_cents, price_type,
      address_text, city, pincode
    ) VALUES (
      $1, ${idx}, ${idx+1}, ${idx+2}, ${idx+3}, ${idx+4},
      {loc_expr}, ${idx+5}, ${idx+6}, ${idx+7}, ${idx+8}::public.price_type,
      ${idx+9}, ${idx+10}, ${idx+11}
    ) RETURNING *;
    """
    params.extend([
        payload.title, payload.description, payload.category, payload.profession_required,
        payload.services_required or [], payload.is_remote, payload.budget_min_cents,
        payload.budget_max_cents, payload.price_type, payload.address_text,
        payload.city, payload.pincode
    ])
    
    row = await conn.fetchrow(query, *params)
    return {"ok": True, "data": dict(row)}


@app.post("/api/jobs/book", tags=["jobs"])
async def book_job(
    payload: BookJobRequest,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
    r: Optional[redis.Redis] = Depends(get_redis),
):
    """
    Direct Booking from Search.
    Logic:
      - If worker accepts direct hire + is online -> 'assigned'
      - Else -> 'requested'
    """
    customer_id = user["id"]
    jd = payload.job_details

    # 1. Check Worker
    worker = await conn.fetchrow(
        """
        SELECT u.id, wp.accepts_direct_hire, wp.is_online, wp.kyc_status, u.role
        FROM public.users u
        JOIN public.worker_profiles wp ON wp.user_id = u.id
        WHERE u.id = $1
        """,
        payload.worker_id
    )
    if not worker: raise HTTPException(404, "Worker not found")
    if worker["role"] != "worker" or worker["kyc_status"] != "verified":
        raise HTTPException(400, "Worker unavailable/unverified")

    # 2. Create Job Record
    # Reuse Create Logic (Simplified for brevity)
    loc_expr = "NULL"
    params = [customer_id]
    idx = 2
    if not jd.is_remote and jd.lat and jd.lon:
        loc_expr = f"ST_SetSRID(ST_MakePoint(${idx+1}, ${idx})::geography, 4326)"
        params.extend([jd.lat, jd.lon])
        idx += 2
        
    query = f"""
    INSERT INTO public.jobs (
      customer_id, title, description, category, profession_required, services_required,
      job_location, is_remote, budget_min_cents, budget_max_cents, price_type,
      address_text, city, pincode
    ) VALUES (
      $1, ${idx}, ${idx+1}, ${idx+2}, ${idx+3}, ${idx+4},
      {loc_expr}, ${idx+5}, ${idx+6}, ${idx+7}, ${idx+8}::public.price_type,
      ${idx+9}, ${idx+10}, ${idx+11}
    ) RETURNING id
    """
    params.extend([
        jd.title, jd.description, jd.category, jd.profession_required,
        jd.services_required or [], jd.is_remote, jd.budget_min_cents,
        jd.budget_max_cents, jd.price_type, jd.address_text,
        jd.city, jd.pincode
    ])
    job_row = await conn.fetchrow(query, *params)
    job_id = job_row["id"]

    # 3. Direct Hire Logic
    is_direct = worker["accepts_direct_hire"] and worker["is_online"]
    
    if is_direct:
        # Direct Assign
        await conn.execute("UPDATE public.jobs SET worker_id = $1, status = 'assigned' WHERE id = $2", payload.worker_id, job_id)
        msg_type = "direct_hire"
        msg = f"New Direct Job: {jd.title}"
    else:
        # Request
        await conn.execute("UPDATE public.jobs SET requested_worker_id = $1, status = 'requested' WHERE id = $2", payload.worker_id, job_id)
        msg_type = "job_request"
        msg = f"New Job Request: {jd.title}"

    # Notify Worker
    if r:
        await r.publish(f"notifications:{payload.worker_id}", json.dumps({
            "type": msg_type, "job_id": str(job_id), "message": msg
        }))

    return {"ok": True, "job_id": str(job_id), "type": "direct" if is_direct else "request"}


@app.get("/api/jobs/{job_id}", tags=["jobs"])
async def get_job(job_id: uuid.UUID, user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)):
    row = await conn.fetchrow("SELECT j.*, u.full_name AS customer_name FROM public.jobs j JOIN public.users u ON u.id = j.customer_id WHERE j.id = $1", job_id)
    if not row: raise HTTPException(404, "Job not found")
    return {"ok": True, "data": dict(row)}

@app.delete("/api/jobs/{job_id}", tags=["jobs"])
async def delete_job(job_id: uuid.UUID, user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)):
    res = await conn.execute("DELETE FROM public.jobs WHERE id = $1 AND customer_id = $2 AND status IN ('open', 'bidding', 'draft')", job_id, user["id"])
    if res == "DELETE 0": raise HTTPException(400, "Cannot delete job")
    return {"ok": True}

# --- Bids & Auto Accept ---

@app.get("/api/jobs/{job_id}/bids", tags=["bids"])
async def list_bids(
    job_id: uuid.UUID,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    """List bids with Rich Worker Profile details"""
    # Verify access
    job = await conn.fetchrow("SELECT customer_id, worker_id FROM public.jobs WHERE id = $1", job_id)
    if not job: raise HTTPException(404, "Job not found")
    
    # Logic: Owner sees all, Worker sees only theirs? 
    # For now, let's allow owner to see all.
    if job["customer_id"] != user["id"]:
         # If not owner, maybe restrict (removed for brevity, add logic if needed)
         pass

    rows = await conn.fetch(
        """
        SELECT b.id, b.amount_cents, b.message, b.created_at, b.status,
               u.id as worker_id, u.full_name, u.avatar_url,
               wp.skills, wp.professions, wp.experience_years,
               COALESCE(gs.rating_avg, 0) as rating, COALESCE(gs.rating_count, 0) as reviews
        FROM public.bids b
        JOIN public.users u ON u.id = b.worker_id
        JOIN public.worker_profiles wp ON wp.user_id = b.worker_id
        LEFT JOIN public.governance_stats gs ON gs.user_id = b.worker_id
        WHERE b.job_id = $1
        ORDER BY b.amount_cents ASC
        """, job_id
    )
    return {"ok": True, "data": [dict(r) for r in rows]}

@app.post("/api/jobs/{job_id}/bids", tags=["bids"])
async def place_bid(
    job_id: uuid.UUID,
    payload: BidCreate,
    worker: dict = Depends(require_worker),
    conn: asyncpg.Connection = Depends(get_db),
    r: Optional[redis.Redis] = Depends(get_redis),
):
    """
    Place Bid. 
    Triggers Auto-Accept if:
      - Fixed Price Job
      - Bid <= Budget Max
      - Customer Wallet >= Bid Amount
    """
    worker_id = worker["id"]
    
    # 1. Fetch Job & Wallet Info
    job = await conn.fetchrow(
        """
        SELECT j.status, j.customer_id, j.budget_max_cents, j.price_type, j.title,
               w.balance_cents
        FROM public.jobs j
        JOIN public.wallets w ON w.user_id = j.customer_id
        WHERE j.id = $1
        """,
        job_id
    )
    if not job or job["status"] not in ("open", "bidding"):
        raise HTTPException(400, "Job not open for bidding")

    # 2. Check Auto-Accept
    auto_accept = False
    if (job["price_type"] == "fixed" and 
        job["budget_max_cents"] is not None and 
        payload.amount_cents <= job["budget_max_cents"] and 
        job["balance_cents"] >= payload.amount_cents):
        auto_accept = True
    
    status_to_set = 'accepted' if auto_accept else 'pending'

    async with conn.transaction():
        # Insert Bid
        bid = await conn.fetchrow(
            """
            INSERT INTO public.bids (job_id, worker_id, amount_cents, message, status)
            VALUES ($1, $2, $3, $4, $5) RETURNING id
            """,
            job_id, worker_id, payload.amount_cents, payload.message, status_to_set
        )
        
        if auto_accept:
            # Assign Job
            await conn.execute("UPDATE public.jobs SET worker_id = $1, status = 'assigned' WHERE id = $2", worker_id, job_id)
            # Move Money: Wallet -> Escrow
            await conn.execute(
                "UPDATE public.wallets SET balance_cents = balance_cents - $1, escrow_cents = escrow_cents + $1 WHERE user_id = $2",
                payload.amount_cents, job["customer_id"]
            )
            # Create Payment Record
            await conn.execute(
                "INSERT INTO public.payments (job_id, payer_id, payee_id, amount_cents, status) VALUES ($1, $2, $3, $4, 'held_in_escrow')",
                job_id, job["customer_id"], worker_id, payload.amount_cents
            )
            # Log Transaction
            await conn.execute(
                "INSERT INTO public.wallet_transactions (user_id, amount_cents, type, description, related_job_id) VALUES ($1, $2, 'job_payment', 'Auto-accepted bid escrow', $3)",
                job["customer_id"], -payload.amount_cents, job_id
            )

    # Notify Customer
    if r:
        msg = f"Job auto-assigned to {worker['full_name']}" if auto_accept else f"New bid: {payload.amount_cents/100}"
        await r.publish(f"notifications:{job['customer_id']}", json.dumps({
            "type": "bid", "job_id": str(job_id), "message": msg
        }))

    return {"ok": True, "bid_id": str(bid["id"]), "auto_accepted": auto_accept}


@app.post("/api/jobs/hire", tags=["jobs"])
async def hire_worker(
    payload: HireRequest,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
    r: Optional[redis.Redis] = Depends(get_redis),
):
    """
    Manual Hire (Customer accepts a bid).
    MOVES MONEY: Wallet -> Escrow.
    """
    uid = user["id"]
    
    # Fetch Data
    data = await conn.fetchrow(
        """
        SELECT j.status, j.title, b.worker_id, b.amount_cents, w.balance_cents
        FROM public.jobs j
        JOIN public.bids b ON b.id = $2
        JOIN public.wallets w ON w.user_id = j.customer_id
        WHERE j.id = $1 AND j.customer_id = $3
        """,
        payload.job_id, payload.bid_id, uid
    )
    
    if not data or data["status"] not in ("open", "bidding"):
        raise HTTPException(400, "Invalid Job/Bid")
    
    if data["balance_cents"] < data["amount_cents"]:
        raise HTTPException(402, "Insufficient funds in wallet")

    async with conn.transaction():
        # Update Bid/Job
        await conn.execute("UPDATE public.bids SET status = 'accepted' WHERE id = $1", payload.bid_id)
        await conn.execute("UPDATE public.jobs SET worker_id = $1, status = 'assigned' WHERE id = $2", data["worker_id"], payload.job_id)
        
        # Lock Funds
        await conn.execute(
            "UPDATE public.wallets SET balance_cents = balance_cents - $1, escrow_cents = escrow_cents + $1 WHERE user_id = $2",
            data["amount_cents"], uid
        )
        await conn.execute(
            "INSERT INTO public.payments (job_id, payer_id, payee_id, amount_cents, status) VALUES ($1, $2, $3, $4, 'held_in_escrow')",
            payload.job_id, uid, data["worker_id"], data["amount_cents"]
        )
        await conn.execute(
            "INSERT INTO public.wallet_transactions (user_id, amount_cents, type, description, related_job_id) VALUES ($1, $2, 'job_payment', 'Escrow Lock', $3)",
            uid, -data["amount_cents"], payload.job_id
        )

    if r:
        await r.publish(f"notifications:{data['worker_id']}", json.dumps({
            "type": "hired", "job_id": str(payload.job_id), "message": f"Hired for {data['title']}"
        }))

    return {"ok": True, "status": "assigned"}

# -------------------------------------------------------------------
# Job Execution (Worker Submit -> Customer Approve)
# -------------------------------------------------------------------

@app.post("/api/jobs/{job_id}/submit_work", tags=["job_execution"])
async def submit_work(
    job_id: uuid.UUID,
    payload: JobProofSubmit,
    worker: dict = Depends(require_worker),
    conn: asyncpg.Connection = Depends(get_db),
    r: Optional[redis.Redis] = Depends(get_redis),
):
    """Worker uploads proofs -> Status: pending_acceptance"""
    job = await conn.fetchrow("SELECT status, worker_id, customer_id, title FROM public.jobs WHERE id = $1", job_id)
    if not job or job["worker_id"] != worker["id"]: raise HTTPException(403, "Not your job")
    if job["status"] not in ("assigned", "in_progress"): raise HTTPException(400, "Job not active")

    async with conn.transaction():
        await conn.execute(
            """
            INSERT INTO public.job_proofs (job_id, worker_proof_imgs, worker_comment, bill_details, worker_submitted_at)
            VALUES ($1, $2, $3, $4::jsonb, now())
            ON CONFLICT (job_id) DO UPDATE SET 
              worker_proof_imgs = EXCLUDED.worker_proof_imgs,
              worker_comment = EXCLUDED.worker_comment,
              bill_details = EXCLUDED.bill_details,
              worker_submitted_at = now()
            """,
            job_id, payload.worker_proof_imgs, payload.worker_comment, json.dumps(payload.bill_details)
        )
        await conn.execute("UPDATE public.jobs SET status = 'pending_acceptance' WHERE id = $1", job_id)

    if r:
        await r.publish(f"notifications:{job['customer_id']}", json.dumps({
            "type": "work_submitted", "job_id": str(job_id), "message": f"Work submitted for {job['title']}"
        }))
        
    return {"ok": True}

@app.post("/api/jobs/{job_id}/approve_work", tags=["job_execution"])
async def approve_work(
    job_id: uuid.UUID,
    payload: JobProofApprove,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
    r: Optional[redis.Redis] = Depends(get_redis),
):
    """
    Customer Approves -> Release Escrow -> Rate -> Close Job
    """
    job = await conn.fetchrow("SELECT worker_id, customer_id, status, title FROM public.jobs WHERE id = $1", job_id)
    if job["customer_id"] != user["id"] or job["status"] != "pending_acceptance": raise HTTPException(400, "Invalid state")

    async with conn.transaction():
        # Update Proofs
        await conn.execute(
            "UPDATE public.job_proofs SET customer_approved=true, customer_comment=$1, customer_acted_at=now() WHERE job_id=$2",
            payload.customer_comment, job_id
        )
        # Close Job
        await conn.execute("UPDATE public.jobs SET status='completed' WHERE id=$1", job_id)
        # Add Rating
        await conn.execute(
            "INSERT INTO public.ratings (job_id, reviewer_id, target_id, rating, comment) VALUES ($1, $2, $3, $4, $5)",
            job_id, user["id"], job["worker_id"], payload.rating, payload.customer_comment
        )
        
        # Release Escrow
        payment = await conn.fetchrow("SELECT id, amount_cents FROM public.payments WHERE job_id=$1 AND status='held_in_escrow'", job_id)
        if payment:
            amount = payment["amount_cents"]
            await conn.execute("UPDATE public.payments SET status='released' WHERE id=$1", payment["id"])
            
            # Credit Worker
            await conn.execute("UPDATE public.wallets SET balance_cents = balance_cents + $1, updated_at=now() WHERE user_id=$2", amount, job["worker_id"])
            
            # Reduce Customer Escrow Lock
            await conn.execute("UPDATE public.wallets SET escrow_cents = escrow_cents - $1 WHERE user_id=$2", amount, user["id"])
            
            # Log Worker Credit
            await conn.execute(
                "INSERT INTO public.wallet_transactions (user_id, amount_cents, type, description, related_job_id) VALUES ($1, $2, 'job_payment', 'Job Payment Received', $3)",
                job["worker_id"], amount, job_id
            )

    if r:
        await r.publish(f"notifications:{job['worker_id']}", json.dumps({
            "type": "payment_received", "job_id": str(job_id), "message": f"Payment released for {job['title']}"
        }))

    return {"ok": True}

# -------------------------------------------------------------------
# Wallet
# -------------------------------------------------------------------

@app.get("/api/wallet", tags=["wallet"])
async def get_my_wallet(user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)):
    row = await conn.fetchrow("SELECT balance_cents, escrow_cents, updated_at FROM public.wallets WHERE user_id = $1", user["id"])
    return {"ok": True, "data": dict(row) if row else {"balance_cents": 0, "escrow_cents": 0}}

@app.get("/api/wallet/transactions", tags=["wallet"])
async def get_wallet_transactions(
    limit: int = 20, offset: int = 0,
    user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)
):
    rows = await conn.fetch("SELECT * FROM public.wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3", user["id"], limit, offset)
    return {"ok": True, "data": [dict(r) for r in rows]}

# -------------------------------------------------------------------
# Chat (REST + WebSocket)
# -------------------------------------------------------------------

@app.post("/api/jobs/{job_id}/chat", tags=["chat"])
async def get_or_create_chat(job_id: uuid.UUID, user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)):
    job = await conn.fetchrow("SELECT customer_id, worker_id FROM public.jobs WHERE id = $1", job_id)
    if not job or user["id"] not in (job["customer_id"], job["worker_id"]): raise HTTPException(403, "Access denied")
    
    chat = await conn.fetchrow("SELECT * FROM public.chats WHERE job_id = $1", job_id)
    if not chat:
        chat = await conn.fetchrow("INSERT INTO public.chats (job_id) VALUES ($1) RETURNING *", job_id)
    return {"ok": True, "data": dict(chat)}

@app.get("/api/chats", tags=["chat"])
async def list_chats(user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)):
    rows = await conn.fetch(
        """
        SELECT c.id AS chat_id, j.id AS job_id, j.title, j.customer_id, j.worker_id, j.status,
               (SELECT content FROM public.messages m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message
        FROM public.chats c JOIN public.jobs j ON j.id = c.job_id
        WHERE j.customer_id = $1 OR j.worker_id = $1
        ORDER BY j.created_at DESC
        """, user["id"]
    )
    return {"ok": True, "data": [dict(r) for r in rows]}

@app.get("/api/chats/{chat_id}/messages", tags=["chat"])
async def get_messages(chat_id: uuid.UUID, user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)):
    job = await conn.fetchrow("SELECT j.customer_id, j.worker_id FROM public.chats c JOIN public.jobs j ON j.id = c.job_id WHERE c.id = $1", chat_id)
    if not job or user["id"] not in (job["customer_id"], job["worker_id"]): raise HTTPException(403, "Access denied")
    
    rows = await conn.fetch("SELECT * FROM public.messages WHERE chat_id = $1 ORDER BY created_at ASC", chat_id)
    return {"ok": True, "data": [dict(r) for r in rows]}

@app.websocket("/ws/chat/{chat_id}")
async def websocket_chat(websocket: WebSocket, chat_id: str = Path(...)):
    await websocket.accept()
    token = _get_token_str(websocket) # Helper checks header
    if not token: await websocket.close(); return

    try:
        payload = verify_and_decode_jwt(token)
        user_id = uuid.UUID(payload["sub"])
    except Exception:
        await websocket.close(); return

    # Check Membership
    conn = await app.state.db_pool.acquire()
    try:
        job = await conn.fetchrow("SELECT j.customer_id, j.worker_id FROM public.chats c JOIN public.jobs j ON j.id = c.job_id WHERE c.id = $1", uuid.UUID(chat_id))
        if not job or user_id not in (job["customer_id"], job["worker_id"]): await websocket.close(); return
    finally:
        await app.state.db_pool.release(conn)

    r = getattr(app.state, "redis", None)
    channel = f"chat:{chat_id}" if r else None
    
    if r:
        pubsub = r.pubsub()
        await pubsub.subscribe(channel)
        
        async def reader():
            try:
                async for msg in pubsub.listen():
                    if msg["type"] == "message": await websocket.send_text(msg["data"])
            except asyncio.CancelledError: pass
        
        task = asyncio.create_task(reader())

    try:
        while True:
            data = await websocket.receive_text()
            # Save to DB
            conn = await app.state.db_pool.acquire()
            try:
                row = await conn.fetchrow("INSERT INTO public.messages (chat_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *", uuid.UUID(chat_id), user_id, data)
            finally:
                await app.state.db_pool.release(conn)
            
            msg_out = json.dumps({
                "id": str(row["id"]), "chat_id": chat_id, "sender_id": str(user_id),
                "content": row["content"], "created_at": row["created_at"].isoformat()
            })
            
            if r: await r.publish(channel, msg_out)
            else: await websocket.send_text(msg_out)

    except WebSocketDisconnect: pass
    finally:
        if r:
            task.cancel()
            await pubsub.close()
        await websocket.close()

# -------------------------------------------------------------------
# Realtime Notifications
# -------------------------------------------------------------------

@app.websocket("/ws/notifications")
async def ws_notifications(websocket: WebSocket):
    await websocket.accept()
    token = websocket.query_params.get("token")
    if not token: await websocket.close(); return
    
    try:
        payload = verify_and_decode_jwt(token)
        user_id = payload["sub"]
    except Exception:
        await websocket.close(); return

    r = getattr(app.state, "redis", None)
    if not r: await websocket.close(); return

    pubsub = r.pubsub()
    await pubsub.subscribe(f"notifications:{user_id}")

    try:
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True)
            if msg: await websocket.send_text(msg["data"])
            await asyncio.sleep(0.1)
    except WebSocketDisconnect: pass
    finally: await pubsub.close()

# -------------------------------------------------------------------
# Admin (Preserved)
# -------------------------------------------------------------------

@app.get("/api/admin/kyc/pending", tags=["admin"])
async def admin_kyc_pending(user: dict = Depends(require_admin), conn: asyncpg.Connection = Depends(get_db)):
    rows = await conn.fetch("SELECT kd.*, u.full_name, u.email FROM public.kyc_documents kd JOIN public.users u ON u.id = kd.user_id WHERE kd.status = 'pending'")
    return {"ok": True, "data": [dict(r) for r in rows]}

@app.post("/api/admin/kyc/{doc_id}/review", tags=["admin"])
async def admin_kyc_review(doc_id: uuid.UUID, payload: AdminKycReview, user: dict = Depends(require_admin), conn: asyncpg.Connection = Depends(get_db)):
    row = await conn.fetchrow("UPDATE public.kyc_documents SET status=$1::public.kyc_status, rejection_reason=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$4 RETURNING *", payload.status, payload.reason, user["id"], doc_id)
    return {"ok": True, "data": dict(row)}

@app.get("/api/admin/complaints", tags=["admin"])
async def admin_complaints(conn: asyncpg.Connection = Depends(get_db), user: dict = Depends(require_admin)):
    rows = await conn.fetch("SELECT * FROM public.complaints ORDER BY created_at DESC")
    return {"ok": True, "data": [dict(r) for r in rows]}

@app.post("/api/admin/complaints/{id}", tags=["admin"])
async def admin_update_complaint(id: uuid.UUID, payload: AdminComplaintUpdate, user: dict = Depends(require_admin), conn: asyncpg.Connection = Depends(get_db)):
    row = await conn.fetchrow("UPDATE public.complaints SET status=$1::public.complaint_status, resolution_notes=$2, resolved_by=$3, resolved_at=now() WHERE id=$4 RETURNING *", payload.status, payload.resolution_notes, user["id"], id)
    return {"ok": True, "data": dict(row)}

@app.patch("/api/admin/users/{user_id}/flag", tags=["admin"])
async def admin_flag_user(user_id: uuid.UUID, payload: AdminFlagUpdate, user: dict = Depends(require_admin), conn: asyncpg.Connection = Depends(get_db)):
    await conn.execute("UPDATE public.users SET is_flagged=$1 WHERE id=$2", payload.is_flagged, user_id)
    await conn.execute("INSERT INTO public.governance_stats (user_id, is_flagged, flagged_reason) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET is_flagged=EXCLUDED.is_flagged", user_id, payload.is_flagged, payload.reason)
    return {"ok": True}